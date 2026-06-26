// "Bring your own audio": align a user's full narration recording to a storyboard.
// Transcribes the recording once (whisper), aligns the storyboard's full script to
// those real timings, then slices the audio per scene and writes per-scene word
// timings (rebased to 0) + audioRef — exactly the shape the renderer expects, so a
// user recording drops into the same per-scene <Audio> model the TTS path uses.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { transcribeAudio, alignTextToTimings } from "./wordTimings.js";

type Scene = { id: string; narration: string; audioRef?: string; durationMs?: number; wordTimings?: { word: string; startMs: number; endMs: number }[] };
type Storyboard = { id: string; scenes: Scene[] };

function ffmpegSlice(src: string, startSec: number, durSec: number, out: string): Promise<void> {
  // Re-encode (not -c copy) so the cut is sample-accurate, not mp3-frame-rounded.
  const cmd = `ffmpeg -y -ss ${startSec.toFixed(3)} -i "${src}" -t ${durSec.toFixed(3)} -acodec libmp3lame -b:a 160k "${out}"`;
  return new Promise((res, reject) => {
    const c = spawn(cmd, { shell: true });
    let tail = ""; const cap = (b: Buffer) => { tail = (tail + b.toString()).slice(-800); };
    c.stdout.on("data", cap); c.stderr.on("data", cap);
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? res() : reject(new Error(`ffmpeg slice exited ${code}: ${tail.slice(-200)}`))));
  });
}

/**
 * Mutates `sb`: for each scene sets audioRef (a sliced mp3 under
 * public/audio/<sb.id>/<scene.id>.mp3), durationMs, and wordTimings (rebased to 0).
 * `padMs` is added to each scene's end so a word isn't clipped.
 */
export async function alignStoryboardToAudio(
  sb: Storyboard,
  fullAudioPath: string,
  opts: { publicDir?: string; model?: string; language?: string; padMs?: number } = {}
): Promise<Storyboard> {
  const publicDir = opts.publicDir ?? resolve(process.cwd(), "..", "remotion", "public");
  const audioDir = join(publicDir, "audio", sb.id);
  await mkdir(audioDir, { recursive: true });
  const padMs = opts.padMs ?? 120;

  // 1) transcribe the whole recording → real word timings for the whole thing.
  const { words: globalWords } = await transcribeAudio(fullAudioPath, { model: opts.model, language: opts.language });
  if (!globalWords.length) throw new Error("whisper found no speech in the audio");

  // 2) align the storyboard's CONCATENATED script to those timings (one pass), so
  //    each script word gets a real timing even where whisper misheard.
  const counts = sb.scenes.map((s) => s.narration.split(/\s+/).filter(Boolean).length);
  const fullScript = sb.scenes.map((s) => s.narration).join(" ");
  const timed = alignTextToTimings(fullScript, globalWords);

  // 3) per scene: take its run of words, slice the audio, rebase timings.
  let idx = 0;
  for (let i = 0; i < sb.scenes.length; i++) {
    const scene = sb.scenes[i];
    const n = counts[i];
    const run = timed.slice(idx, idx + n);
    idx += n;
    if (!run.length) continue;
    const startMs = run[0].startMs;
    const nextStartMs = idx < timed.length ? timed[idx].startMs : run[run.length - 1].endMs + padMs;
    const endMs = Math.max(run[run.length - 1].endMs + padMs, nextStartMs);
    const file = join(audioDir, `${scene.id}.mp3`);
    await ffmpegSlice(fullAudioPath, startMs / 1000, (endMs - startMs) / 1000, file);
    scene.audioRef = `audio/${sb.id}/${scene.id}.mp3`;
    scene.durationMs = endMs - startMs;
    scene.wordTimings = run.map((w) => ({ word: w.word, startMs: w.startMs - startMs, endMs: w.endMs - startMs }));
  }
  return sb;
}
