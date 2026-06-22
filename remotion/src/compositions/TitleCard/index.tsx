import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// ─── Resolved TitleSpec ─────────────────────────────────────────────────────────

export type TitleMode = "impact" | "wordByWord" | "typewriter" | "lineReveal";
export type TitleSpec = {
  mode: TitleMode;
  eyebrow?: string;
  title: string; // may contain \n for line breaks
  subtitle?: string;
  /** line indices rendered in accent/red; default = all lines after the first. */
  accentLines?: number[];
};

export type TitleCardProps = { durationMs: number; title: TitleSpec };

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

const isAccent = (spec: TitleSpec, lineIdx: number, totalLines: number) =>
  spec.accentLines ? spec.accentLines.includes(lineIdx) : lineIdx > 0;

// ─── Component ──────────────────────────────────────────────────────────────────

export const TitleCard: React.FC<TitleCardProps> = ({ durationMs, title }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };

  const exitStart = totalFrames - msToFrames(sg.motion.durationsMs.exit, fps);
  const exitOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitY = interpolate(frame, [exitStart, totalFrames], [0, -28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let inner: React.ReactNode;
  switch (title.mode) {
    case "wordByWord": inner = <WordByWord t={title} ctx={ctx} />; break;
    case "typewriter": inner = <Typewriter t={title} ctx={ctx} />; break;
    case "lineReveal": inner = <LineReveal t={title} ctx={ctx} />; break;
    default: inner = <Impact t={title} ctx={ctx} />;
  }

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 55% 40% at 42% 50%, rgba(207,52,52,0.07) 0%, transparent 70%)", opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }) }} />
      <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx * 1.5, top: "50%", transform: `translateY(-50%) translateY(${exitY}px)`, opacity: exitOpacity }}>
        {inner}
      </div>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ text?: string; ctx: Ctx }> = ({ text, ctx: { sg, frame, fps } }) => {
  if (!text) return null;
  const s = springFrom(frame, fps, 2, { damping: 22, stiffness: 110 });
  return <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.primary, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase", marginBottom: 20, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)` }}>{text}</div>;
};

const Subtitle: React.FC<{ text?: string; spring: number; ctx: Ctx }> = ({ text, spring, ctx: { sg } }) => {
  if (!text) return null;
  return <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 400, color: sg.color.textMuted, letterSpacing: sg.typography.tracking.body, marginTop: 32, maxWidth: 760, lineHeight: 1.4, opacity: spring, transform: `translateY(${interpolate(spring, [0, 1], [24, 0])}px)` }}>{text}</div>;
};

const Rule: React.FC<{ p: number; ctx: Ctx }> = ({ p, ctx: { sg } }) => (
  <div style={{ width: interpolate(p, [0, 1], [0, 72]), height: 3, background: sg.color.primary, marginBottom: 28 }} />
);

const lineStyle = (sg: Ctx["sg"], accent: boolean): React.CSSProperties => ({
  fontFamily: syneFontFamily, fontSize: sg.typography.scale.h1, fontWeight: 800,
  color: accent ? sg.color.primary : sg.color.text, letterSpacing: sg.typography.tracking.h1, lineHeight: 0.92, margin: 0,
});

// ─── impact (the slam/drop) ─────────────────────────────────────────────────────

const Impact: React.FC<{ t: TitleSpec; ctx: Ctx }> = ({ t, ctx }) => {
  const { sg, frame, fps } = ctx;
  const lineP = spring({ frame, fps, config: { damping: 26, stiffness: 150 } });
  const titleP = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 95 } });
  const subP = spring({ frame: frame - 18, fps, config: { damping: 22, stiffness: 100 } });
  const lines = t.title.split("\n");
  return (
    <>
      <Eyebrow text={t.eyebrow} ctx={ctx} />
      <Rule p={lineP} ctx={ctx} />
      {lines.map((line, i) => (
        <div key={i} style={{ ...lineStyle(sg, isAccent(t, i, lines.length)), opacity: titleP, transform: `translateY(${interpolate(titleP, [0, 1], [54, 0])}px) scale(${interpolate(titleP, [0, 1], [1.06, 1])})`, transformOrigin: "left center" }}>{line}</div>
      ))}
      <Subtitle text={t.subtitle} spring={subP} ctx={ctx} />
    </>
  );
};

// ─── wordByWord (reveal as spoken) ──────────────────────────────────────────────

const WordByWord: React.FC<{ t: TitleSpec; ctx: Ctx }> = ({ t, ctx }) => {
  const { sg, frame, fps, totalFrames } = ctx;
  const lineP = spring({ frame, fps, config: { damping: 26, stiffness: 150 } });
  const lines = t.title.split("\n").map((l) => l.split(/\s+/));
  const totalWords = lines.reduce((a, l) => a + l.length, 0);
  const revealEnd = totalFrames * 0.62;
  const per = revealEnd / Math.max(1, totalWords);
  let wi = 0;
  const subP = springFrom(frame, fps, revealEnd, { damping: 22, stiffness: 100 });
  return (
    <>
      <Eyebrow text={t.eyebrow} ctx={ctx} />
      <Rule p={lineP} ctx={ctx} />
      {lines.map((words, li) => (
        <div key={li} style={lineStyle(sg, isAccent(t, li, lines.length))}>
          {words.map((w, k) => {
            const s = springFrom(frame, fps, 6 + (wi++) * per, { damping: 20, stiffness: 110 });
            return <span key={k} style={{ display: "inline-block", marginRight: "0.26em", opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` }}>{w}</span>;
          })}
        </div>
      ))}
      <Subtitle text={t.subtitle} spring={subP} ctx={ctx} />
    </>
  );
};

// ─── typewriter (char stagger + cursor) ─────────────────────────────────────────

const Typewriter: React.FC<{ t: TitleSpec; ctx: Ctx }> = ({ t, ctx }) => {
  const { sg, frame, fps, totalFrames } = ctx;
  const lines = t.title.split("\n");
  const flat = t.title.replace(/\n/g, "");
  const charEnd = totalFrames * 0.55;
  const shown = Math.round(interpolate(frame, [4, charEnd], [0, flat.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  let count = 0;
  const cursorOn = Math.floor(frame / (fps * 0.27)) % 2 === 0;
  const subP = springFrom(frame, fps, charEnd, { damping: 22, stiffness: 100 });
  return (
    <>
      <Eyebrow text={t.eyebrow} ctx={ctx} />
      <Rule p={spring({ frame, fps, config: { damping: 26, stiffness: 150 } })} ctx={ctx} />
      {lines.map((line, li) => {
        const chars = line.split("");
        return (
          <div key={li} style={lineStyle(sg, isAccent(t, li, lines.length))}>
            {chars.map((c, k) => {
              const visible = count++ < shown;
              return <span key={k} style={{ opacity: visible ? 1 : 0 }}>{c}</span>;
            })}
            {/* cursor at the end of the line currently typing */}
            {count >= shown && count - chars.length < shown && (
              <span style={{ opacity: cursorOn ? 1 : 0, color: sg.color.primary }}>▌</span>
            )}
            {(() => { count++; return null; })()}
          </div>
        );
      })}
      <Subtitle text={t.subtitle} spring={subP} ctx={ctx} />
    </>
  );
};

// ─── lineReveal (mask wipe up) ──────────────────────────────────────────────────

const LineReveal: React.FC<{ t: TitleSpec; ctx: Ctx }> = ({ t, ctx }) => {
  const { sg, frame, fps } = ctx;
  const lines = t.title.split("\n");
  const subP = springFrom(frame, fps, 12 + lines.length * 6, { damping: 22, stiffness: 100 });
  return (
    <>
      <Eyebrow text={t.eyebrow} ctx={ctx} />
      <Rule p={spring({ frame, fps, config: { damping: 26, stiffness: 150 } })} ctx={ctx} />
      {lines.map((line, i) => {
        const s = springFrom(frame, fps, 4 + i * 7, { damping: 22, stiffness: 110 });
        return (
          <div key={i} style={{ overflow: "hidden", paddingBottom: 6 }}>
            <div style={{ ...lineStyle(sg, isAccent(t, i, lines.length)), transform: `translateY(${interpolate(s, [0, 1], [110, 0])}%)` }}>{line}</div>
          </div>
        );
      })}
      <Subtitle text={t.subtitle} spring={subP} ctx={ctx} />
    </>
  );
};

/** Builds a TitleSpec from a scene's `style` — new `style.titleCard` object, or legacy flat fields. */
export function styleToTitleSpec(style: Record<string, any>): TitleSpec {
  if (style.titleCard && typeof style.titleCard === "object") return style.titleCard as TitleSpec;
  return { mode: "impact", eyebrow: style.eyebrow, title: style.title ?? "", subtitle: style.subtitle };
}
