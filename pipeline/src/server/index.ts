// First-slice backend: a thin HTTP API + in-process job worker around the existing
// pipeline. Turns the CLI engine into something a frontend can call:
//   POST /jobs            create a render/import/generate job  -> { id }
//   GET  /jobs/:id        poll status/progress                 -> { status, stage, progress, outputUrl }
//   GET  /jobs            list your jobs
//   GET  /outputs/:file   stream the finished mp4 (Range-enabled)
//   GET  /health
//
// Built on node:http (zero new deps) so it runs immediately with tsx. PRODUCTION
// SWAP: Fastify/Next routes, BullMQ workers, Postgres, S3/R2 + CDN, real auth.
//   Start:  npx tsx src/server/index.ts     (env: PORT, API_KEYS)

import http from "node:http";
import { createReadStream, createWriteStream, statSync, existsSync, readFileSync } from "node:fs";
import { readdir, mkdir, rm, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomUUID } from "node:crypto";
import { join, basename, dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JobStore, type JobMode } from "./jobs.js";
import { runJob, OUTPUTS_DIR, STORYBOARDS_DIR, UPLOADS_DIR, PREPARED_DIR, PUBLIC_DIR } from "./runJob.js";
import { authenticate, authDisabled } from "./auth.js";
import { log, errInfo } from "./logger.js";
import { MAX_BODY_BYTES, MAX_UPLOAD_BYTES, validateJobInput, publicJob, jobLabel, cleanErrorMessage } from "./validate.js";
import { mapStoryboardToReview } from "./review.js";
import { writeFile as writeFileFsp } from "node:fs/promises";
import { generateFluxImage, buildFluxPrompt } from "../assets/flux.js";

const PORT = Number(process.env.PORT ?? 8787);
const store = new JobStore();
const MODES: JobMode[] = ["render", "import", "generate", "audio", "prepare"];
const UI_HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ui.html"), "utf8");

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
};

/** HTTP errors carry a statusCode so the top-level catch can pick the right code. */
class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

/** Stream an output mp4 with HTTP Range support (so browsers can seek). */
function serveOutput(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  const safe = basename(file); // no path traversal
  const path = join(OUTPUTS_DIR, safe);
  if (!safe.endsWith(".mp4") || !existsSync(path)) return json(res, 404, { error: "not found" });
  const size = statSync(path).size;
  const range = req.headers.range;
  // Clamp the requested range into [0, size) so a malformed header can't read OOB.
  let start = 0;
  let end = size - 1;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    start = m && m[1] ? Math.min(parseInt(m[1], 10), size - 1) : 0;
    end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (isNaN(start) || isNaN(end) || start > end) return json(res, 416, { error: "invalid range" });
    res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
  } else {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size, "Accept-Ranges": "bytes" });
  }
  const stream = createReadStream(path, range ? { start, end } : {});
  // A client that seeks/aborts mid-stream fires ECONNRESET on the read stream;
  // swallow it (it's expected) so it never bubbles into an uncaught exception.
  stream.on("error", (err) => {
    log.warn("output stream error", { file: safe, message: (err as Error).message });
    res.destroy();
  });
  stream.pipe(res);
}

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm",
};

/** Serve a fetched/generated asset from remotion/public (read-only, image+video
 *  types only, path-traversal guarded). Public like /outputs so <img>/<video> work
 *  without an auth header. Supports HTTP Range for video so a <video> element in the
 *  review gate can actually play and seek (without Range, browsers often refuse). */
function serveMedia(req: http.IncomingMessage, res: http.ServerResponse, rel: string) {
  let decoded: string;
  try { decoded = decodeURIComponent(rel); } catch { return json(res, 400, { error: "bad path" }); }
  const full = resolve(PUBLIC_DIR, decoded);
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + sep)) return json(res, 403, { error: "forbidden" });
  if (!existsSync(full) || !statSync(full).isFile()) return json(res, 404, { error: "not found" });
  const ctype = MEDIA_TYPES[extname(full).toLowerCase()];
  if (!ctype) return json(res, 415, { error: "unsupported media" });
  const size = statSync(full).size;
  const range = req.headers.range;
  if (range && ctype.startsWith("video/")) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Math.min(parseInt(m[1], 10), size - 1) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (isNaN(start) || isNaN(end) || start > end) return json(res, 416, { error: "invalid range" });
    res.writeHead(206, { "Content-Type": ctype, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "public, max-age=300" });
    const stream = createReadStream(full, { start, end });
    stream.on("error", () => res.destroy());
    return stream.pipe(res);
  }
  res.writeHead(200, { "Content-Type": ctype, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=300" });
  const stream = createReadStream(full);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const reqId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const method = req.method ?? "GET";
  const reqPath = (req.url ?? "/").split("?")[0];
  // One access-log line per request, emitted once the response is flushed.
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    log[level](`${method} ${reqPath} → ${res.statusCode}`, { reqId, ms });
  });

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/health") return json(res, 200, { ok: true, queued: store.list().filter((j) => j.status === "queued").length });

    // The single-page studio UI.
    if (path === "/" && method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(UI_HTML); }

    // Output files + asset media are public (so <video>/<img> work without an auth
    // header); everything else needs a key.
    if (path.startsWith("/outputs/")) return serveOutput(req, res, path.slice("/outputs/".length));
    if (path.startsWith("/media/")) return serveMedia(req, res, path.slice("/media/".length));

    const owner = authenticate(req.headers.authorization);
    if (!owner) return json(res, 401, { error: "unauthorized — send Authorization: Bearer <API_KEYS entry>" });

    if (path === "/storyboards" && method === "GET") {
      const files = existsSync(STORYBOARDS_DIR) ? (await readdir(STORYBOARDS_DIR)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
      return json(res, 200, { storyboards: files.sort() });
    }

    // Review data for a prepared film (out/prepared) or a library storyboard
    // (remotion/storyboards) — script prose, real fetched visuals, real captions.
    const rev = /^\/review\/([a-z0-9._-]+)$/.exec(path);
    if (rev && method === "GET") {
      const id = basename(rev[1]); // belt-and-suspenders against traversal
      let sbPath = join(PREPARED_DIR, `${id}.json`);
      if (!existsSync(sbPath)) sbPath = join(STORYBOARDS_DIR, `${id}.json`);
      if (!existsSync(sbPath)) return json(res, 404, { error: "not found" });
      return json(res, 200, mapStoryboardToReview(JSON.parse(await readFile(sbPath, "utf8"))));
    }

    // PUT /prepared/:id/pick-asset — swap the selected asset for a scene.
    // Body: { sceneId: string, ref: string }  (ref = the candidate's local path)
    const pickAsset = /^\/prepared\/([a-z0-9._-]+)\/pick-asset$/.exec(path);
    if (pickAsset && method === "PUT") {
      const id = basename(pickAsset[1]);
      const sbPath = join(PREPARED_DIR, `${id}.json`);
      if (!existsSync(sbPath)) return json(res, 404, { error: "not found" });
      const { sceneId, ref } = await readBody(req);
      if (!sceneId || !ref) return json(res, 400, { error: "sceneId and ref required" });
      const sb = JSON.parse(await readFile(sbPath, "utf8"));
      const scene = (sb.scenes ?? []).find((s: any) => s.id === sceneId);
      if (!scene) return json(res, 404, { error: "scene not found" });
      const cands: any[] = scene.visual?.candidates ?? [];
      const pick = cands.find((c: any) => c.ref === ref || c.url === ref);
      if (!pick) return json(res, 404, { error: "candidate not found" });
      // Promote the chosen candidate to assets[0]
      scene.visual.assets = [{ ref: pick.ref ?? pick.url, kind: pick.kind ?? "image", source: pick.source ?? "wikimedia", license: pick.license ?? { type: "unknown", attributionRequired: false } }];
      await writeFileFsp(sbPath, JSON.stringify(sb, null, 2));
      return json(res, 200, { ok: true });
    }

    // POST /prepared/:id/generate-asset — FLUX-generate a still for a scene.
    // Body: { sceneId: string }
    const genAsset = /^\/prepared\/([a-z0-9._-]+)\/generate-asset$/.exec(path);
    if (genAsset && method === "POST") {
      const id = basename(genAsset[1]);
      const sbPath = join(PREPARED_DIR, `${id}.json`);
      if (!existsSync(sbPath)) return json(res, 404, { error: "not found" });
      const { sceneId } = await readBody(req);
      if (!sceneId) return json(res, 400, { error: "sceneId required" });
      const sb = JSON.parse(await readFile(sbPath, "utf8"));
      const scene = (sb.scenes ?? []).find((s: any) => s.id === sceneId);
      if (!scene) return json(res, 404, { error: "scene not found" });
      const assetDir = join(PUBLIC_DIR, "assets", sb.id);
      await mkdir(assetDir, { recursive: true });
      const fileName = `${sceneId}-generated.png`;
      const absPath = join(assetDir, fileName);
      const bytes = await generateFluxImage(buildFluxPrompt(scene.visual?.directive ?? sceneId), { width: 1536, height: 864 });
      await writeFileFsp(absPath, bytes);
      const ref = `assets/${sb.id}/${fileName}`;
      scene.visual.assets = [{ ref, kind: "image", source: "imageModel", license: { type: "AI-generated", attributionRequired: false } }];
      // Prepend to candidates so it shows first in the picker
      const cands: any[] = scene.visual.candidates ?? [];
      scene.visual.candidates = [{ ref, kind: "image", source: "imageModel", license: { type: "AI-generated", attributionRequired: false } }, ...cands];
      await writeFileFsp(sbPath, JSON.stringify(sb, null, 2));
      return json(res, 200, { ok: true, ref });
    }

    // Raw audio upload (the browser POSTs the file bytes; ?name=<filename>). The
    // name is reduced to a safe stem; a counting transform caps the byte size so a
    // client can't fill the disk; the file lands inside UPLOADS_DIR only.
    if (path === "/uploads" && method === "POST") {
      await mkdir(UPLOADS_DIR, { recursive: true });
      const name = basename(url.searchParams.get("name") ?? "upload.bin").replace(/[^a-z0-9._-]/gi, "_");
      const dest = join(UPLOADS_DIR, `${randomUUID()}-${name}`);
      let received = 0;
      const limit = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length;
          if (received > MAX_UPLOAD_BYTES) return cb(new HttpError(413, "upload too large"));
          cb(null, chunk);
        },
      });
      try {
        await pipeline(req, limit, createWriteStream(dest));
      } catch (err) {
        await rm(dest, { force: true }).catch(() => {});
        const status = err instanceof HttpError ? err.statusCode : 400;
        log.warn("upload failed", { reqId, message: errInfo(err).message });
        return json(res, status, { error: status === 413 ? "upload too large" : "upload failed" });
      }
      log.info("upload stored", { reqId, name, bytes: received });
      return json(res, 200, { path: dest });
    }

    if (path === "/jobs" && method === "POST") {
      const body = await readBody(req);
      const mode = body.mode as JobMode;
      if (!MODES.includes(mode)) return json(res, 400, { error: `mode must be one of ${MODES.join(", ")}` });
      const v = validateJobInput(mode, body, UPLOADS_DIR);
      if (!v.ok) return json(res, 400, { error: v.error });
      const job = store.create(mode, v.input, owner, jobLabel(mode, v.input));
      log.info("job created", { reqId, jobId: job.id, mode });
      return json(res, 202, { id: job.id, status: job.status });
    }
    const reveal = { revealErrors: authDisabled() };
    if (path === "/jobs" && method === "GET") return json(res, 200, { jobs: store.list(owner).map((j) => publicJob(j, reveal)) });

    const m = /^\/jobs\/([0-9a-f-]+)$/.exec(path);
    if (m && method === "GET") {
      const job = store.get(m[1]);
      if (!job || job.owner !== owner) return json(res, 404, { error: "not found" });
      return json(res, 200, publicJob(job, reveal));
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    // 4xx are client mistakes (validation, bad JSON) — safe to echo. 5xx are ours:
    // log the full detail with the request id, return only a generic ref to the
    // client so internals (paths, stack frames) never leak.
    const status = err instanceof HttpError ? err.statusCode : 500;
    const info = errInfo(err);
    if (status >= 500) log.error("unhandled request error", { reqId, path: reqPath, ...info });
    else log.warn("request rejected", { reqId, message: info.message });
    if (res.headersSent) return res.destroy();
    return json(res, status, { error: status >= 500 ? `internal error (ref ${reqId})` : info.message });
  }
});

// ── single in-process worker: drain the queue one job at a time (render is heavy) ──
let busy = false;
async function tick() {
  if (busy) return;
  const id = store.dequeue();
  if (!id) return;
  busy = true;
  const job = store.get(id)!;
  const t0 = Date.now();
  store.patch(id, { status: "running", progress: 0.02, stage: "start" });
  log.info("job started", { jobId: id, mode: job.mode });
  try {
    await runJob(store.get(id)!, (p) => store.patch(id, p));
    log.info("job succeeded", { jobId: id, ms: Date.now() - t0 });
  } catch (err) {
    // Store the raw message internally (publicJob sanitizes it on the way out)
    // and log the full stack here with the job id for correlation.
    const info = errInfo(err);
    log.error("job failed", { jobId: id, mode: job.mode, ms: Date.now() - t0, ...info });
    // Clean (extract the inner message from JSON-blob SDK errors) BEFORE truncating,
    // so the stored error stays parseable/readable rather than a clipped JSON blob.
    store.patch(id, { status: "failed", error: cleanErrorMessage(info.message).slice(0, 600) });
  } finally {
    busy = false;
    setImmediate(tick);
  }
}

// Last-resort guards so a stray rejection/exception logs instead of killing the
// process silently (the in-process worker would otherwise stop draining).
process.on("unhandledRejection", (reason) => log.error("unhandledRejection", { ...errInfo(reason) }));
process.on("uncaughtException", (err) => log.error("uncaughtException", { ...errInfo(err) }));
setInterval(tick, 500);

server.listen(PORT, () => {
  console.error(`\n  ▶ Documentary Pipeline studio:  http://localhost:${PORT}\n`);
  console.error(`    API: POST /jobs · GET /jobs/:id · GET /outputs/:id.mp4`);
  console.error(authDisabled() ? "    auth: DISABLED (no API_KEYS) — dev mode\n" : "    auth: Authorization: Bearer <key>\n");
});
