// Vision verification for fetched footage. Keyword search returns whole films
// tagged with a topic — but the actual frames may be a cartoon (Duck and Cover),
// a talking-head, a title card, or a chart. A vision model LOOKS at sampled frames
// and decides whether the clip authentically shows the subject — and which moment
// shows it best (so we play THAT segment, fixing content-drift at the same time).

import { generateVisionJson, type VisionImage } from "../gemini/client.js";
import { stripFences } from "../shared/storyboardIO.js";
import { sampleFrames } from "./frames.js";

export type FootageVerdict = { relevant: boolean; bestAtMs?: number; reason?: string };

/** Injectable so tests can supply a verdict without calling Gemini (quota). */
export type VisionJsonFn = (opts: {
  system: string;
  user: string;
  images: VisionImage[];
}) => Promise<string>;

const SYSTEM = [
  "You verify archival documentary footage. You are shown several frames sampled from ONE video clip, in order, each taken at a labeled timestamp.",
  "Decide whether the clip AUTHENTICALLY shows the requested SUBJECT as genuine archival film of the real event/thing.",
  "REJECT (relevant=false) if the frames are: animation or cartoon, a diagram/chart/map, a title card or text screen, a talking-head interview, a modern TV news broadcast, a re-enactment, or simply not the subject.",
  "ACCEPT (relevant=true) only if at least one frame is real footage that genuinely depicts the subject.",
  "Output JSON only.",
].join(" ");

/**
 * Samples frames across the clip and asks a vision model whether it shows `subject`.
 * Returns the verdict plus the timestamp (ms) of the best frame, snapped to one of
 * the sampled timestamps.
 */
export async function verifyFootage(
  videoPath: string,
  subject: string,
  durationSec: number,
  opts: { vision?: VisionJsonFn; frameWidth?: number } = {}
): Promise<FootageVerdict> {
  // Spread samples across the body of the clip (skip the very start/end). Four
  // frames is enough signal; fewer keeps remote range-sampling fast.
  const fractions = [0.12, 0.38, 0.62, 0.85];
  const secs = fractions.map((f) => Math.max(1, durationSec * f));
  const frames = await sampleFrames(videoPath, secs, opts.frameWidth ?? 512, 25_000);
  if (frames.length === 0) return { relevant: false, reason: "no frames could be sampled" };

  const stamps = frames.map((f) => f.atMs);
  const user = [
    `SUBJECT: ${subject}`,
    `The ${frames.length} frames below are in order, sampled at these timestamps in milliseconds: [${stamps.join(", ")}].`,
    `Return JSON: {"relevant": boolean, "bestFrameMs": number, "reason": string}.`,
    `"bestFrameMs" MUST be one of the listed timestamps (the frame that best shows the subject), or -1 if none do.`,
  ].join("\n");

  const vision = opts.vision ?? generateVisionJson;
  const raw = await vision({ system: SYSTEM, user, images: frames.map((f) => ({ data: f.data, mimeType: f.mimeType })) });
  let parsed: any;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { relevant: false, reason: "verifier returned unparseable JSON" };
  }

  const relevant = parsed?.relevant === true;
  let bestAtMs: number | undefined;
  if (relevant) {
    const want = Number(parsed?.bestFrameMs);
    // Snap to the nearest sampled timestamp; default to the middle frame.
    bestAtMs = Number.isFinite(want) && want >= 0
      ? stamps.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
      : stamps[Math.floor(stamps.length / 2)];
  }
  return { relevant, bestAtMs, reason: typeof parsed?.reason === "string" ? parsed.reason : undefined };
}
