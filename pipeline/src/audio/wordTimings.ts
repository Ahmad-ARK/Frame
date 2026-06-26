// Accurate word timings from an audio waveform, via OpenAI Whisper's word-level
// timestamps. Replaces the edge-tts char-interpolation (which assumed a uniform
// speaking rate and drifted 300-600ms per word, and couldn't see pauses).
//
// Two uses:
//   1. TTS audio — we KNOW the script, so transcribe for TIMINGS and align the
//      known words to them (whisper may mishear a word, but its timings are good).
//   2. User-provided audio — transcribe to get BOTH the text and the timings.
//
// Requires the `whisper` CLI on PATH (openai-whisper). Falls back gracefully:
// callers catch and keep their previous timings if whisper isn't available.

import { spawn } from "node:child_process";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import { tmpdir } from "node:os";

export type Word = { word: string; startMs: number; endMs: number };
export type Transcript = { text: string; words: Word[]; durationMs: number };

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Run whisper and return its word-level transcript (text it HEARD + timings). */
export async function transcribeAudio(
  audioPath: string,
  opts: { model?: string; language?: string } = {}
): Promise<Transcript> {
  const abs = resolve(audioPath);
  if (!existsSync(abs)) throw new Error(`audio not found: ${abs}`);
  const outDir = join(tmpdir(), `whisper-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(outDir, { recursive: true });
  // `small` is the accuracy sweet spot (cached, fits 6GB, fast on GPU). Override
  // with WHISPER_MODEL=medium for even better (≈1.5GB download, ~5GB VRAM).
  const model = opts.model ?? process.env.WHISPER_MODEL ?? "small";
  const lang = opts.language ?? "en";
  const args = [`"${abs}"`, "--model", model, "--language", lang, "--word_timestamps", "True",
    "--output_format", "json", "--output_dir", `"${outDir}"`, "--fp16", "False", "--verbose", "False"];
  await runWhisper(`whisper ${args.join(" ")}`);

  const jsonPath = join(outDir, `${basename(abs, extname(abs))}.json`);
  if (!existsSync(jsonPath)) { await rm(outDir, { recursive: true, force: true }); throw new Error("whisper produced no JSON output"); }
  const data = JSON.parse(await readFile(jsonPath, "utf8"));
  await rm(outDir, { recursive: true, force: true });

  const words: Word[] = [];
  for (const seg of data.segments ?? [])
    for (const w of seg.words ?? [])
      if (w.word?.trim()) words.push({ word: w.word.trim(), startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) });
  const text = (data.text ?? "").trim();
  const durationMs = words.length ? words[words.length - 1].endMs : 0;
  return { text, words, durationMs };
}

/**
 * Aligns the KNOWN script words to whisper's timed words (Needleman-Wunsch on the
 * normalised token streams), so each script word gets a real audio timing even
 * when whisper misheard or merged a token. Gaps are filled by proportional
 * interpolation between the surrounding matched words.
 */
export function alignTextToTimings(knownText: string, timed: Word[]): Word[] {
  const known = knownText.split(/\s+/).filter(Boolean);
  if (!known.length) return [];
  if (!timed.length) return known.map((w, i) => ({ word: w, startMs: i * 200, endMs: i * 200 + 180 }));

  const a = known.map(norm);
  const b = timed.map((t) => norm(t.word));
  const n = a.length, m = b.length;
  const MATCH = 2, MISMATCH = -1, GAP = -1;
  // DP score matrix + traceback.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH);
      dp[i][j] = Math.max(diag, dp[i - 1][j] + GAP, dp[i][j - 1] + GAP);
    }
  // Trace back → for each known index, the matched timed index (or -1).
  const matchOf = new Array<number>(n).fill(-1);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const diag = dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH);
    if (dp[i][j] === diag) { matchOf[i - 1] = j - 1; i--; j--; }
    else if (dp[i][j] === dp[i - 1][j] + GAP) i--;
    else j--;
  }

  // Assign timings: matched words get the real ones; unmatched runs interpolate.
  const out: Word[] = known.map((w) => ({ word: w, startMs: 0, endMs: 0 }));
  let k = 0;
  while (k < n) {
    if (matchOf[k] >= 0) { const t = timed[matchOf[k]]; out[k].startMs = t.startMs; out[k].endMs = t.endMs; k++; continue; }
    // run of unmatched [k..e)
    let e = k; while (e < n && matchOf[e] < 0) e++;
    const prevEnd = k > 0 ? out[k - 1].endMs : (timed[0]?.startMs ?? 0);
    const nextStart = e < n && matchOf[e] >= 0 ? timed[matchOf[e]].startMs : (timed[timed.length - 1]?.endMs ?? prevEnd + (e - k) * 200);
    const span = Math.max(60 * (e - k), nextStart - prevEnd);
    const totalChars = known.slice(k, e).reduce((s, w) => s + Math.max(1, w.length), 0);
    let t = prevEnd;
    for (let x = k; x < e; x++) {
      const wdur = span * (Math.max(1, known[x].length) / totalChars);
      out[x].startMs = Math.round(t); out[x].endMs = Math.round(t + wdur); t += wdur;
    }
    k = e;
  }
  return out;
}

/** Whisper for an audio file whose TEXT we already know → script words + real timings. */
export async function alignAudioToText(audioPath: string, knownText: string, opts?: { model?: string; language?: string }): Promise<Word[]> {
  const { words } = await transcribeAudio(audioPath, opts);
  return alignTextToTimings(knownText, words);
}

export const whisperAvailable = (): Promise<boolean> =>
  new Promise((res) => {
    const c = spawn("whisper --help", { shell: true });
    c.on("error", () => res(false));
    c.on("close", (code) => res(code === 0));
  });

function runWhisper(cmd: string): Promise<void> {
  return new Promise((res, reject) => {
    const c = spawn(cmd, { shell: true });
    let tail = "";
    const cap = (b: Buffer) => { tail = (tail + b.toString()).slice(-1500); };
    c.stdout.on("data", cap); c.stderr.on("data", cap);
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? res() : reject(new Error(`whisper exited ${code}: ${tail.slice(-300)}`))));
  });
}
