import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { StoryboardSchema } from "../schema/storyboard.js";
import { alignAudioToText, whisperAvailable } from "../audio/wordTimings.js";

const execFileP = promisify(execFile);

// Draft voiceover stage (build brief §8): generate narration audio per scene
// with edge-tts (free Microsoft TTS — the cheap draft voice; ElevenLabs is the
// final voice later), measure each clip, and DERIVE each scene's durationMs
// from its narration length. Audio lands in Remotion's public/ so the renderer
// muxes it natively via <Audio>.

type Args = { input?: string; out?: string; voice: string; padMs: number; whisper: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { voice: "en-US-ChristopherNeural", padMs: 650, whisper: true };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const val = eq >= 0 ? raw.slice(eq + 1) : argv[i + 1];
    if (key === "--out") { args.out = val; if (eq < 0) i++; }
    else if (key === "--voice") { args.voice = val; if (eq < 0) i++; }
    else if (key === "--pad") { args.padMs = Number(val); if (eq < 0) i++; }
    else if (key === "--no-whisper") args.whisper = false; // keep the fast char-interp timings
    else if (!raw.startsWith("--")) positional.push(raw);
  }
  args.input = positional[0];
  return args;
}

type WordTiming = { word: string; startMs: number; endMs: number };

const HELPER = resolve(process.cwd(), "..", "scripts", "edge_tts_words.py");

/** Generates mp3 + per-word timings via the python edge-tts helper. */
async function ttsToFile(
  text: string,
  voice: string,
  outFile: string
): Promise<WordTiming[]> {
  const txt = join(tmpdir(), `vo-${Math.random().toString(36).slice(2)}.txt`);
  const timingsFile = join(tmpdir(), `vo-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(txt, text, "utf8");
  await execFileP(
    "python",
    [HELPER, "--text-file", txt, "--voice", voice, "--out-audio", outFile, "--out-timings", timingsFile],
    { maxBuffer: 1024 * 1024 * 16 }
  );
  const parsed = JSON.parse(await readFile(timingsFile, "utf8"));
  return parsed.words ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function durationMs(file: string): Promise<number> {
  // On Windows, files under OneDrive (or scanned by Defender) get briefly locked
  // right after they're written — ffprobe then fails with "Permission denied" /
  // "Access is denied" / EBUSY (a sharing violation), even though the file is fine.
  // Retry with backoff so a transient lock doesn't kill the whole prepare.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const { stdout } = await execFileP("ffprobe", [
        "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file,
      ]);
      const d = Math.round(parseFloat(stdout.trim()) * 1000);
      if (Number.isFinite(d) && d > 0) return d;
      lastErr = new Error("ffprobe returned no duration");
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message ?? err);
      const locked = /permission denied|access is denied|EACCES|EBUSY|EPERM|sharing violation|being used by another process/i.test(msg);
      // A non-lock error won't fix itself — fail fast after a couple of tries.
      if (!locked && attempt >= 2) throw err;
      console.error(`    · ffprobe lock on "${file.split(/[\\/]/).pop()}" (attempt ${attempt}/6) — retrying`);
    }
    await sleep(400 * attempt);
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: npx tsx src/cli/voiceover.ts <storyboard.json> [--voice=en-US-ChristopherNeural] [--pad=650] [--out=path]");
    process.exit(1);
  }

  const inPath = resolve(args.input);
  const outPath = resolve(args.out ?? args.input);
  const sb = StoryboardSchema.parse(JSON.parse(await readFile(inPath, "utf8")));

  const publicDir = resolve(process.cwd(), "..", "remotion", "public");
  const audioDir = join(publicDir, "audio", sb.id);
  await mkdir(audioDir, { recursive: true });

  // edge-tts gives only sentence boundaries (→ char-interpolated word times that
  // drift). If whisper is available, RE-TIME each clip against its own audio so
  // captions/visuals land on the real spoken word. `--no-whisper` keeps the fast path.
  const useWhisper = args.whisper && (await whisperAvailable());
  console.error(`Generating voiceover for "${sb.topic}" (voice: ${args.voice})${useWhisper ? " · whisper word-timing" : ""} ...\n`);
  let total = 0;
  for (const scene of sb.scenes) {
    // Defensive: scene.id is normally clamped at import, but a cached/older
    // storyboard may carry a runaway id. Bound the filename stem so the .mp3 write
    // can't exceed the OS path-component limit (255 chars / Windows MAX_PATH).
    const stem = scene.id.length > 80 ? scene.id.slice(0, 72).replace(/-+$/, "") : scene.id;
    const file = join(audioDir, `${stem}.mp3`);
    let words = await ttsToFile(scene.narration, args.voice, file);
    const ms = await durationMs(file);
    scene.durationMs = ms + args.padMs;
    scene.audioRef = `audio/${sb.id}/${stem}.mp3`;
    let timed = "interp";
    if (useWhisper) {
      try { const a = await alignAudioToText(file, scene.narration); if (a.length) { words = a; timed = "whisper"; } }
      catch (err) { console.error(`    · whisper re-time failed (${String((err as Error).message).slice(0, 50)}) — kept interp`); }
    }
    if (words.length) scene.wordTimings = words;
    total += scene.durationMs;
    console.error(`  ✓ ${scene.id.padEnd(28)} ${(scene.durationMs / 1000).toFixed(1)}s · ${words.length} words · ${timed}`);
  }

  const validated = StoryboardSchema.parse(sb);
  await writeFile(outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");
  console.error(`\n✓ Voiced ${sb.scenes.length} scenes · total ${(total / 1000).toFixed(1)}s → ${outPath}`);
}

main().catch((err) => {
  console.error("\n✗ Voiceover failed:\n" + (err as Error).message);
  process.exit(1);
});
