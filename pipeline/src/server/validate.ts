// Input sanitization + validation for the API boundary. The job worker shells out
// to subprocesses and reads files off disk, so everything that crosses this line
// is treated as hostile until checked: sizes are capped, ids/slugs are reduced to
// safe character sets, free-text is length-bounded, and file paths are confined to
// the uploads dir (no traversal / arbitrary-file reads). It also projects the
// internal Job into a client-safe shape and maps raw errors to messages that don't
// leak internals.

import { resolve, sep } from "node:path";
import type { Job, JobMode } from "./jobs.js";

export const MAX_BODY_BYTES = 1_000_000; // 1 MB JSON bodies (scripts fit easily)
export const MAX_UPLOAD_BYTES = 200_000_000; // 200 MB audio uploads
export const MAX_SCRIPT_CHARS = 60_000;
export const MAX_FIELD_CHARS = 2_000;

export const CAPTION_STYLES = ["off", "clean", "karaoke", "word", "bar", "bold"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

// Strip C0 control chars except \t (09) \n (0A) \r (0D), plus DEL (7F). Built from
// an ASCII-only pattern string so the source file contains no literal control bytes.
const CONTROL_CHARS = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "g");

/** Lowercase id safe to use as a filename stem (storyboard ids). */
export const sanitizeId = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);

/** Slug for channel ids etc. — letters/digits/dashes only. */
export const sanitizeSlug = (s: unknown, fallback = "") => {
  const v = String(s ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
  return v || fallback;
};

/** Trim, strip control chars (except \t \n \r), and cap length. */
export const cleanText = (s: unknown, max = MAX_FIELD_CHARS) =>
  String(s ?? "").replace(CONTROL_CHARS, "").trim().slice(0, max);

export const cleanCaptionStyle = (s: unknown): CaptionStyle =>
  (CAPTION_STYLES as readonly string[]).includes(String(s)) ? (s as CaptionStyle) : "karaoke";

/** True iff `child` resolves to a path inside `parent` (prevents ../ escapes). */
export function isInside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
}

export type ValidationResult =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate + sanitize a POST /jobs body for the given mode. Returns a clean,
 * minimal `input` (only the fields the worker uses) or a 400-worthy message.
 * `audioPath`, when present, must live inside `uploadsDir`.
 */
export function validateJobInput(
  mode: JobMode,
  body: Record<string, unknown>,
  uploadsDir: string
): ValidationResult {
  const input: Record<string, unknown> = {
    captionStyle: cleanCaptionStyle(body.captionStyle),
    channelId: sanitizeSlug(body.channelId, "documentary-dark"),
  };

  if (mode === "render") {
    // Render a reviewed film (preparedId) or a library storyboard (storyboardId).
    if (body.preparedId !== undefined && body.preparedId !== "") {
      const pid = sanitizeId(body.preparedId);
      if (!pid) return { ok: false, error: "`preparedId` is invalid" };
      input.preparedId = pid;
      return { ok: true, input };
    }
    const id = sanitizeId(body.storyboardId);
    if (!id) return { ok: false, error: "`storyboardId` or `preparedId` is required for mode=render" };
    input.storyboardId = id;
    return { ok: true, input };
  }

  // free-text fields shared by import/generate/audio/prepare
  if (body.topic !== undefined) input.topic = cleanText(body.topic);
  if (body.thesis !== undefined) input.thesis = cleanText(body.thesis);

  // `prepare` runs the pipeline up to (not including) render. It accepts any
  // single source — a script, a topic, or an uploaded recording.
  if (mode === "prepare") {
    const script = cleanText(body.script, MAX_SCRIPT_CHARS);
    if (script) input.script = script;
    const audioPath = String(body.audioPath ?? "");
    if (audioPath) {
      if (!isInside(uploadsDir, audioPath)) return { ok: false, error: "`audioPath` must be a file returned by POST /uploads" };
      input.audioPath = resolve(audioPath);
    }
    // A stable per-film id lets a failed prepare RESUME from its last good step.
    const filmId = sanitizeId(body.filmId);
    if (filmId) input.filmId = filmId;
    if (!input.script && !input.topic && !input.audioPath) {
      return { ok: false, error: "prepare needs a `script`, `topic`, or `audioPath`" };
    }
    return { ok: true, input };
  }

  if (mode === "import") {
    const script = cleanText(body.script, MAX_SCRIPT_CHARS);
    if (!script) return { ok: false, error: "`script` is required for mode=import" };
    input.script = script;
    return { ok: true, input };
  }

  if (mode === "generate") {
    if (!input.topic) return { ok: false, error: "`topic` is required for mode=generate" };
    return { ok: true, input };
  }

  if (mode === "audio") {
    const audioPath = String(body.audioPath ?? "");
    if (!audioPath) return { ok: false, error: "`audioPath` is required for mode=audio (upload via POST /uploads first)" };
    if (!isInside(uploadsDir, audioPath)) return { ok: false, error: "`audioPath` must be a file returned by POST /uploads" };
    input.audioPath = resolve(audioPath);
    const script = cleanText(body.script, MAX_SCRIPT_CHARS);
    if (script) input.script = script; // optional: skip transcription when provided
    return { ok: true, input };
  }

  return { ok: false, error: `unsupported mode "${mode}"` };
}

/** A human name for the jobs dashboard, derived from the sanitized input. */
export function jobLabel(mode: JobMode, input: Record<string, unknown>): string {
  const titleize = (s: string) => s.replace(/\.storyboard$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (mode === "render") return titleize(String(input.preparedId || input.storyboardId || "Untitled"));
  if (mode === "import") return String(input.topic || "Your script");
  if (mode === "generate") return String(input.topic || "Untitled documentary");
  if (mode === "audio") return "Your narration";
  if (mode === "prepare") return String(input.topic || (input.audioPath ? "Your narration" : "Your script"));
  return "Untitled";
}

/**
 * Client-safe view of a job — no internal `input`/`owner`. In dev mode
 * (`revealErrors`, i.e. no API_KEYS) the real error is passed through so the
 * single local user can actually debug; in multi-tenant prod it's sanitized so
 * internals (paths, stacks) never leak.
 */
export function publicJob(job: Job, opts: { revealErrors?: boolean } = {}) {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    label: job.label,
    preparedId: job.preparedId,
    outputUrl: job.outputUrl,
    error: job.error ? (opts.revealErrors ? cleanErrorMessage(job.error).slice(0, 600) : safeClientError(job.error)) : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Map a raw error message to something safe to show a user. Known, non-sensitive
 * messages (validation, missing storyboard, rate limits) pass through; anything
 * that looks like a subprocess/stack/internal detail collapses to a generic line.
 * The full error is always logged server-side regardless.
 */
export function safeClientError(raw: string): string {
  const msg = cleanErrorMessage(raw);
  if (/^`?\w+`? is required|^`?\w+`? must be|^unknown storyboardId|^unsupported mode/i.test(msg)) return msg.slice(0, 240);
  if (/quota|rate.?limit|\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return "Your AI quota is exhausted. Please check your plan or try again later.";
  if (/\b(503|502|500)\b|UNAVAILABLE|overloaded|high demand|temporarily/i.test(msg)) return "The AI service is busy right now. Please try again in a moment.";
  if (/timed out|timeout|ETIMEDOUT/i.test(msg)) return "The job timed out. Please try again.";
  if (/exited \d+|ENOENT|EACCES|spawn|Chromium|remotion|whisper|ffmpeg|stack/i.test(msg)) return "Rendering failed while processing your film. Please try again.";
  return "Something went wrong while processing this job.";
}

/**
 * Pull the human message out of an error string. The Gemini SDK throws errors
 * whose message is a JSON blob like {"error":{"code":503,"message":"…"}} — show
 * just the inner message rather than the raw JSON.
 */
export function cleanErrorMessage(raw: string): string {
  const msg = String(raw);
  const brace = msg.indexOf("{");
  if (brace !== -1) {
    try {
      const obj = JSON.parse(msg.slice(brace));
      const inner = obj?.error?.message ?? obj?.message;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    } catch {
      /* not JSON — fall through */
    }
  }
  return msg;
}
