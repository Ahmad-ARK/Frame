// Job orchestration: turns a job into an mp4 by REUSING the existing pipeline
// functions (import/generate/enrich/assets) + spawning the existing voiceover and
// Remotion-render CLIs. This is the same generate → voiceover → enrich → assets →
// render flow the CLIs run, just driven by the queue and reporting progress.
//
// PRODUCTION NOTES: render + voiceover are subprocesses (Chromium / python) — in a
// real deployment these run on dedicated render workers (or Remotion Lambda), and
// outputs go to object storage (S3/R2) instead of a local dir served by the API.

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { importScript } from "../importer/importScript.js";
import { generateStoryboard } from "../script/generateScript.js";
import { enrichStoryboard } from "../enrich/enrichStoryboard.js";
import { enrichStoryboardAssets } from "../assets/enrichAssets.js";
import { SYSTEM_PROMPT as IMPORT_PROMPT } from "../importer/prompt.js";
import { SCRIPT_SYSTEM_PROMPT } from "../script/prompt.js";
import { ENRICH_SYSTEM_PROMPT } from "../enrich/prompt.js";
import { alignStoryboardToAudio } from "../audio/alignStoryboardAudio.js";
import { transcribeAudio } from "../audio/wordTimings.js";
import { log, errInfo } from "./logger.js";
import type { Job, JobPatch } from "./jobs.js";

const PIPELINE_DIR = process.cwd();
const REPO_ROOT = resolve(PIPELINE_DIR, "..");
const REMOTION_DIR = resolve(REPO_ROOT, "remotion");
export const STORYBOARDS_DIR = resolve(REMOTION_DIR, "storyboards");
// Remotion's public dir holds the fetched/generated asset images (served at /media).
export const PUBLIC_DIR = resolve(REMOTION_DIR, "public");
const JOBS_DIR = resolve(PIPELINE_DIR, "out", "jobs");
export const OUTPUTS_DIR = resolve(PIPELINE_DIR, "out", "server-outputs");
export const UPLOADS_DIR = resolve(PIPELINE_DIR, "out", "uploads");
// Storyboards prepared (voiced + enriched + assets fetched) but NOT yet rendered,
// awaiting user review. The review gates read these; render consumes them.
export const PREPARED_DIR = resolve(PIPELINE_DIR, "out", "prepared");
// Per-film working dirs holding a partial storyboard + a checkpoint, so a prepare
// that fails midway (e.g. a Gemini blip at enrich) can RESUME from the last good
// step on retry instead of re-running import/voiceover from scratch.
export const WORK_DIR = resolve(PIPELINE_DIR, "out", "work");

// The resumable build steps, in order. The checkpoint records the last one done.
const STEPS = ["source", "voiceover", "enrich", "assets"] as const;

// A fingerprint of the prompts that shape the storyboard. Folding it into the
// checkpoint hash means changing a prompt (e.g. making scenes more visual)
// invalidates cached work, so the next run REBUILDS instead of resuming a
// storyboard produced by the old prompt.
const PROMPT_VERSION = createHash("sha1")
  .update(IMPORT_PROMPT + SCRIPT_SYSTEM_PROMPT + ENRICH_SYSTEM_PROMPT)
  .digest("hex")
  .slice(0, 8);

const sourceHash = (input: Record<string, unknown>) =>
  createHash("sha1")
    .update(JSON.stringify([input.script ?? "", input.topic ?? "", input.thesis ?? "", input.audioPath ?? "", input.channelId ?? "", PROMPT_VERSION]))
    .digest("hex")
    .slice(0, 16);

type Update = (p: JobPatch) => void;

/** Run a shell command, streaming lines to `onLine`; rejects on non-zero exit. */
function runCmd(cmd: string, cwd: string, onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, { cwd, shell: true });
    let tail = "";
    const onData = (b: Buffer) => {
      const s = b.toString();
      tail = (tail + s).slice(-2000);
      if (onLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolveP() : reject(new Error(`\`${cmd.split(" ")[0]} …\` exited ${code}: ${tail.slice(-400)}`))));
  });
}

const sanitizeId = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

export async function runJob(job: Job, update: Update): Promise<void> {
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(OUTPUTS_DIR, { recursive: true });
  const captionStyle = (job.input.captionStyle as string) ?? "karaoke";

  let storyboard: any;
  let sbPath: string;

  if (job.mode === "render") {
    // Render an already-prepared storyboard: a reviewed one from out/prepared/
    // (preparedId) or a library storyboard from remotion/storyboards/ (storyboardId).
    if (job.input.preparedId) {
      const pid = sanitizeId(job.input.preparedId as string);
      sbPath = join(PREPARED_DIR, `${pid}.json`);
      if (!pid || !existsSync(sbPath)) throw new Error(`unknown preparedId "${job.input.preparedId}" (prepare the film first)`);
    } else {
      const id = sanitizeId(job.input.storyboardId as string);
      sbPath = join(STORYBOARDS_DIR, `${id}.json`);
      if (!id || !existsSync(sbPath)) throw new Error(`unknown storyboardId "${job.input.storyboardId}" (expected remotion/storyboards/<id>.json)`);
    }
    storyboard = JSON.parse(await readFile(sbPath, "utf8"));
    update({ stage: "loaded", progress: 0.1 });
  } else {
    // Full pipeline as four resumable steps: source → voiceover → enrich → assets.
    // A STABLE film id (passed by the client, else the job id) gives this film a
    // workspace that survives retries, so a failure midway resumes from the last
    // completed step instead of re-running everything.
    const topic = (job.input.topic as string) ?? "Untitled";
    const thesis = job.input.thesis as string | undefined;
    const channelId = (job.input.channelId as string) ?? "documentary-dark";
    const src: "audio" | "import" | "generate" =
      job.mode === "audio" || job.mode === "import" || job.mode === "generate"
        ? job.mode
        : job.input.audioPath
          ? "audio"
          : (job.input.script as string)?.trim()
            ? "import"
            : "generate";

    const filmId = sanitizeId((job.input.filmId as string) || `job-${job.id.slice(0, 8)}`);
    const hash = sourceHash(job.input);
    const wdir = join(WORK_DIR, filmId);
    await mkdir(wdir, { recursive: true });
    const ckptPath = join(wdir, "checkpoint.json");
    const sbWorkPath = join(wdir, "storyboard.json");

    // Resume from the checkpoint IF the source is unchanged (an edited script
    // invalidates the old work and rebuilds from step 0).
    let doneStep = -1;
    if (existsSync(ckptPath) && existsSync(sbWorkPath)) {
      try {
        const ck = JSON.parse(await readFile(ckptPath, "utf8"));
        if (ck.sourceHash === hash && typeof ck.step === "number") {
          doneStep = ck.step;
          storyboard = JSON.parse(await readFile(sbWorkPath, "utf8"));
          log.info("resuming from checkpoint", { jobId: job.id, filmId, resumeAfter: STEPS[doneStep] ?? "(none)" });
        }
      } catch {
        /* corrupt checkpoint → rebuild from scratch */
      }
    }

    const checkpoint = async (step: number) => {
      await writeFile(sbWorkPath, JSON.stringify(storyboard, null, 2));
      await writeFile(ckptPath, JSON.stringify({ step, stage: STEPS[step], sourceHash: hash, updatedAt: new Date().toISOString() }));
    };

    // Step 0 — build the storyboard from its source (import / generate / audio).
    if (doneStep < 0) {
      update({ stage: src, progress: 0.08 });
      if (src === "audio") {
        const audioPath = job.input.audioPath as string;
        if (!audioPath || !existsSync(audioPath)) throw new Error("`audioPath` (a narration recording on the server) is required");
        const provided = (job.input.script as string)?.trim();
        const text = provided || (await transcribeAudio(audioPath)).text;
        storyboard = (await importScript(text, { channelId, topic, thesis })).storyboard;
      } else if (src === "import") {
        const script = job.input.script as string;
        if (!script?.trim()) throw new Error("`script` is required");
        storyboard = (await importScript(script, { channelId, topic, thesis })).storyboard;
      } else {
        storyboard = (await generateStoryboard({ channelId, topic, thesis })).storyboard;
      }
      storyboard.id = filmId; // stable → assets/audio land in dirs that survive retries
      await checkpoint(0);
    }

    // Step 1 — voiceover (TTS) or align (a user recording).
    if (doneStep < 1) {
      if (src === "audio") {
        update({ stage: "align-audio", progress: 0.3 });
        storyboard = await alignStoryboardToAudio(storyboard, job.input.audioPath as string);
      } else {
        update({ stage: "voiceover", progress: 0.3 });
        await writeFile(sbWorkPath, JSON.stringify(storyboard, null, 2)); // CLI reads this file
        await runCmd(`npx tsx src/cli/voiceover.ts "${sbWorkPath}"`, PIPELINE_DIR);
        storyboard = JSON.parse(await readFile(sbWorkPath, "utf8"));
      }
      await checkpoint(1);
    }

    // Step 2 — enrich (one Gemini call). Retry once; a sensitive-topic safety
    // block or a 503 is probabilistic. A second failure stops here, and the
    // checkpoint means "Try again" resumes from enrich (script + voice reused).
    if (doneStep < 2) {
      update({ stage: "enrich", progress: 0.5 });
      try {
        storyboard = (await enrichStoryboard(storyboard)).storyboard;
      } catch (err) {
        log.warn("enrich failed, retrying once", { jobId: job.id, ...errInfo(err) });
        storyboard = (await enrichStoryboard(storyboard)).storyboard;
      }
      await checkpoint(2);
    }

    // Step 3 — fetch real footage/images.
    if (doneStep < 3) {
      update({ stage: "assets", progress: 0.68 });
      storyboard = (await enrichStoryboardAssets(storyboard)).storyboard;
      await checkpoint(3);
    }

    // PREPARE stops here: the film is voiced, enriched, and has real assets, but
    // isn't rendered. It's saved for the user to review (Visuals/Captions gates
    // read it via /review/:id) and then render (mode=render, preparedId).
    if (job.mode === "prepare") {
      await mkdir(PREPARED_DIR, { recursive: true });
      await writeFile(join(PREPARED_DIR, `${filmId}.json`), JSON.stringify(storyboard, null, 2));
      update({ status: "succeeded", stage: "done", progress: 1, preparedId: filmId });
      return;
    }
  }

  // ── render: feed the storyboard to the generic DynamicDocumentary via --props ──
  update({ stage: "render", progress: 0.82 });
  const propsPath = join(JOBS_DIR, `${job.id}.props.json`);
  await writeFile(propsPath, JSON.stringify({ storyboard, captionStyle }));
  const outPath = join(OUTPUTS_DIR, `${job.id}.mp4`);
  await runCmd(
    `npx remotion render DynamicDocumentary "${outPath}" --props="${propsPath}" --log=error`,
    REMOTION_DIR,
    (line) => {
      const m = /Rendered (\d+)\/(\d+)/.exec(line);
      if (m) update({ progress: 0.82 + 0.16 * (Number(m[1]) / Number(m[2])) });
    }
  );

  update({ status: "succeeded", stage: "done", progress: 1, outputUrl: `/outputs/${job.id}.mp4` });
}
