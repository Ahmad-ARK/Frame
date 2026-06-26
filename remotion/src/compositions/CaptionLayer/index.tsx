import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";
import { buildCues, activeCue, type CaptionCue, type CaptionWord } from "../../utils/captions";
import type { WordTiming } from "../../types/storyboard";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();

// Burned-in, WORD-SYNCED captions driven by the scene's TTS word timings. Five
// looks; "clean" is the automatic default. All sit in the lower third, sized to
// read on mobile, with their own contrast so they survive any footage behind them.
export type CaptionStyle = "off" | "clean" | "karaoke" | "word" | "bar" | "bold";
export const CAPTION_STYLES: Exclude<CaptionStyle, "off">[] = ["clean", "karaoke", "word", "bar", "bold"];

const WORDS_PER_STYLE: Record<string, number> = { clean: 6, karaoke: 6, bar: 7, bold: 4, word: 6 };

export const CaptionLayer: React.FC<{
  wordTimings?: WordTiming[];
  durationMs: number;
  styleId?: CaptionStyle;
}> = ({ wordTimings, durationMs, styleId = "clean" }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const cues = useMemo(
    () => buildCues(wordTimings as CaptionWord[] | undefined, { maxWords: WORDS_PER_STYLE[styleId] ?? 6 }),
    [wordTimings, styleId]
  );
  if (styleId === "off" || !cues.length) return null;
  const found = activeCue(cues, ms);
  if (!found) return null;
  const { cue } = found;

  // Per-cue fade (in fast, hold, out just before the next cue).
  const fade = Math.min(
    interpolate(ms, [cue.startMs, cue.startMs + 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(ms, [cue.endMs - 130, cue.endMs], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );
  const ctx = { sg, frame, fps, ms, width, height, fade };
  switch (styleId) {
    case "karaoke": return <Karaoke cue={cue} {...ctx} />;
    case "word": return <WordPop cue={cue} {...ctx} />;
    case "bar": return <Bar cue={cue} {...ctx} />;
    case "bold": return <Bold cue={cue} {...ctx} />;
    default: return <Clean cue={cue} {...ctx} />;
  }
};

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; ms: number; width: number; height: number; fade: number; cue: CaptionCue };

const BOTTOM = 110; // distance from the bottom edge for the lower-third caption band
const SHADOW = "0 2px 14px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.9)";

// ── clean: phrase on a translucent pill (the professional default) ──
const Clean: React.FC<Ctx> = ({ cue, sg, fade }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: BOTTOM, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
    <div style={{ maxWidth: "74%", background: "rgba(8,8,12,0.64)", borderRadius: 12, padding: "10px 24px", fontFamily: dmSansFontFamily, fontWeight: 600, fontSize: 36, lineHeight: 1.28, color: "#f4f1ea", textAlign: "center", letterSpacing: 0.2, textShadow: SHADOW, opacity: fade, transform: `translateY(${interpolate(fade, [0, 1], [10, 0])}px)` }}>
      {cue.text}
    </div>
  </div>
);

// ── karaoke: phrase visible; the active word pops in the accent colour ──
const Karaoke: React.FC<Ctx> = ({ cue, sg, ms, fade }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: BOTTOM, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
    <div style={{ maxWidth: "76%", background: "rgba(8,8,12,0.64)", borderRadius: 12, padding: "10px 24px", fontFamily: dmSansFontFamily, fontWeight: 600, fontSize: 36, lineHeight: 1.28, textAlign: "center", textShadow: SHADOW, opacity: fade }}>
      {cue.words.map((w, i) => {
        const active = ms >= w.startMs && ms < w.endMs;
        const spoken = ms >= w.startMs;
        return (
          <span key={i} style={{ color: active ? sg.color.accent : "#f4f1ea", opacity: spoken ? 1 : 0.5, fontWeight: active ? 800 : 600, display: "inline-block", transform: active ? "scale(1.06)" : "scale(1)", transition: "none" }}>
            {w.word}{i < cue.words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  </div>
);

// ── word: one word at a time, big, popping in on the beat (kinetic) ──
const WordPop: React.FC<Ctx> = ({ cue, sg, frame, fps, ms }) => {
  // The word being spoken (or the last one, between words).
  let w = cue.words.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!w) { for (const x of cue.words) if (ms >= x.startMs) w = x; }
  if (!w) w = cue.words[0];
  const pop = springFrom(frame, fps, msToFrames(w.startMs, fps), { damping: 16, stiffness: 150 });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: "72%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <span style={{ fontFamily: syneFontFamily, fontWeight: 800, fontSize: 78, color: "#f7f4ee", letterSpacing: -0.5, transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`, opacity: interpolate(pop, [0, 1], [0, 1]), paintOrder: "stroke", WebkitTextStroke: `2px ${sg.color.bg}`, textShadow: SHADOW }}>
        {w.word}
      </span>
    </div>
  );
};

// ── bar: a broadcast lower-third bar with an accent edge ──
const Bar: React.FC<Ctx> = ({ cue, sg, width, fade }) => (
  <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, bottom: 78, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
    <div style={{ display: "flex", alignItems: "stretch", maxWidth: "100%", background: "rgba(20,20,28,0.92)", boxShadow: "0 14px 40px rgba(0,0,0,0.5)", opacity: fade, transform: `translateY(${interpolate(fade, [0, 1], [14, 0])}px)` }}>
      <div style={{ width: 5, background: sg.color.primary, flexShrink: 0 }} />
      <div style={{ padding: "12px 22px", fontFamily: dmSansFontFamily, fontWeight: 600, fontSize: 33, lineHeight: 1.25, color: "#f4f1ea", letterSpacing: 0.2 }}>{cue.text}</div>
    </div>
  </div>
);

// ── bold: big uppercase phrase, active word in accent, heavy stroke (punchy) ──
const Bold: React.FC<Ctx> = ({ cue, sg, ms, fade }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: "70%", display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 8%" }}>
    <div style={{ fontFamily: syneFontFamily, fontWeight: 800, fontSize: 56, lineHeight: 1.08, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5, opacity: fade, paintOrder: "stroke" } as React.CSSProperties}>
      {cue.words.map((w, i) => {
        const active = ms >= w.startMs && ms < w.endMs;
        return (
          <span key={i} style={{ color: active ? sg.color.accent : "#f7f4ee", WebkitTextStroke: `3px ${sg.color.bg}`, textShadow: SHADOW, display: "inline-block" }}>
            {w.word}{i < cue.words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  </div>
);
