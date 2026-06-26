// Turns per-word TTS timings into caption "cues" (short phrase chunks) for the
// CaptionLayer. Chunks break on a natural pause (a gap between words), a word
// count, or a character budget — so a cue is a readable line, not a runaway
// sentence. Each cue stays on screen until the next begins (no flicker gaps).

export type CaptionWord = { word: string; startMs: number; endMs: number };
export type CaptionCue = { words: CaptionWord[]; text: string; startMs: number; endMs: number };

export function buildCues(
  wt: CaptionWord[] | undefined,
  opts: { maxWords?: number; maxChars?: number; pauseMs?: number } = {}
): CaptionCue[] {
  if (!wt || !wt.length) return [];
  const maxWords = opts.maxWords ?? 6;
  const maxChars = opts.maxChars ?? 42;
  const pauseMs = opts.pauseMs ?? 340;

  const cues: CaptionCue[] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;
  const flush = () => {
    if (!cur.length) return;
    cues.push({ words: cur, text: cur.map((w) => w.word).join(" "), startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs });
    cur = [];
    chars = 0;
  };
  for (let i = 0; i < wt.length; i++) {
    const w = wt[i];
    cur.push(w);
    chars += w.word.length + 1;
    const next = wt[i + 1];
    const gap = next ? next.startMs - w.endMs : Infinity;
    // Break after a sentence-ish pause, or once the line is full.
    const endsSentence = /[.!?:]$/.test(w.word);
    if (cur.length >= maxWords || chars >= maxChars || gap > pauseMs || (endsSentence && cur.length >= 2)) flush();
  }
  flush();
  // Hold each cue until the next one starts (prevents blank flashes between cues).
  for (let i = 0; i < cues.length; i++) {
    cues[i].endMs = cues[i + 1] ? cues[i + 1].startMs : cues[i].endMs + 500;
  }
  return cues;
}

/** The cue active at time `ms`, plus its index, or null. */
export function activeCue(cues: CaptionCue[], ms: number): { cue: CaptionCue; index: number } | null {
  for (let i = 0; i < cues.length; i++) {
    if (ms >= cues[i].startMs && ms < cues[i].endMs) return { cue: cues[i], index: i };
  }
  return null;
}
