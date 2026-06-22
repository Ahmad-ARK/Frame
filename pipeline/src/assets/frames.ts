// Samples still frames from a video file via ffmpeg, returned as base64 PNGs for
// a vision model to inspect. Frames are downscaled (the model doesn't need full
// res to judge subject relevance) to keep the request payload small.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileP = promisify(execFile);

export type SampledFrame = { atMs: number; data: string; mimeType: "image/png" };

/**
 * Extracts one frame at each given timestamp (seconds). Returns base64 PNGs,
 * downscaled to `width` px wide. Frames that fail to extract are skipped.
 */
export async function sampleFrames(
  videoPath: string,
  atSecs: number[],
  width = 512,
  timeoutMs = 45_000
): Promise<SampledFrame[]> {
  const out: SampledFrame[] = [];
  for (const t of atSecs) {
    const tmp = join(tmpdir(), `frame-${process.pid}-${Math.round(t * 1000)}-${Math.random().toString(36).slice(2, 8)}.png`);
    try {
      // -ss before -i = fast input seek; over http this uses byte-range requests,
      // so we read only the bytes around the timestamp (no full download). One
      // frame, scaled down preserving aspect. Timeout guards a non-seekable source.
      await execFileP("ffmpeg", [
        "-v", "error", "-ss", String(t), "-i", videoPath,
        "-frames:v", "1", "-vf", `scale=${width}:-1`, "-y", tmp,
      ], { timeout: timeoutMs });
      const buf = await readFile(tmp);
      out.push({ atMs: Math.round(t * 1000), data: buf.toString("base64"), mimeType: "image/png" });
    } catch {
      /* skip unreadable/slow timestamp */
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  return out;
}
