// Cheap, honest derivations from a user's pasted script — used so the review
// gates show THEIR words while the live pipeline (which produces the real
// word-level timings and title) is still being wired in. Timestamps here are
// placeholders: they read as a plausible cadence, and a banner in the Captions
// gate makes clear the exact timing comes from the render.
import type { Caption } from "./store";

let seq = 0;
const uid = () => `cap_${(++seq).toString(36)}`;

const WRAP = 44; // ~chars per caption line
const SECS_PER_LINE = 2.6; // placeholder cadence

/** Split a script into readable caption lines (sentence-aware, word-wrapped). */
export function captionsFromScript(script: string): Caption[] {
  const clean = script.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const lines: string[] = [];
  for (const s of sentences) {
    let cur = "";
    for (const w of s.trim().split(" ")) {
      if (cur && (cur + " " + w).length > WRAP) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cur ? cur + " " + w : w;
      }
    }
    if (cur) lines.push(cur);
  }
  let t = 0;
  return lines.slice(0, 400).map((text) => {
    const label = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    t += SECS_PER_LINE;
    return { id: uid(), t: label, text };
  });
}

/** A short, readable title from the opening sentence (word-capped, never mid-word). */
export function titleFromScript(script: string): string {
  const first = (script.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "").trim();
  if (!first) return "Untitled documentary";
  if (first.length <= 56) return first.replace(/[.!?]+$/, "");
  const words = first.split(" ");
  let out = "";
  for (const w of words) {
    if ((out + " " + w).trim().length > 52) break;
    out = out ? out + " " + w : w;
  }
  return (out || first.slice(0, 52)).replace(/[.!?]+$/, "") + "…";
}

/** Estimate runtime in seconds from a script at ~150 words/min narration. */
export function estimateRuntimeSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60);
}
