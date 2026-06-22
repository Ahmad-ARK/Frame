import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// ─── Resolved QuoteSpec ─────────────────────────────────────────────────────────

export type QuoteMode = "standard" | "portrait" | "kinetic" | "statement" | "document";
export type QuoteSpec = {
  mode: QuoteMode;
  quote: string;
  attribution?: string;
  role?: string;
  emphasis?: string[]; // words/phrases to highlight (kinetic/statement)
  portrait?: { src?: string; subject?: string; caption?: string; focal?: { x: number; y: number } };
  source?: string; // document stamp, e.g. "CIA Cable · Dec 1979 · DECLASSIFIED"
};

export type QuoteCardProps = { durationMs: number; quote: QuoteSpec };

const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);

/** Splits text into tokens, marking emphasis spans. */
function tokenize(text: string, emphasis?: string[]): { word: string; hot: boolean }[] {
  const lower = (emphasis ?? []).map((e) => e.toLowerCase());
  return text.split(/\s+/).map((w) => {
    const bare = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hot = lower.some((e) => e.split(/\s+/).map((x) => x.replace(/[^a-z0-9]/g, "")).includes(bare));
    return { word: w, hot };
  });
}

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

// ─── Component ──────────────────────────────────────────────────────────────────

export const QuoteCard: React.FC<QuoteCardProps> = ({ durationMs, quote }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let body: React.ReactNode;
  switch (quote.mode) {
    case "portrait": body = <Portrait q={quote} ctx={ctx} />; break;
    case "kinetic": body = <Kinetic q={quote} ctx={ctx} />; break;
    case "statement": body = <Statement q={quote} ctx={ctx} />; break;
    case "document": body = <Document q={quote} ctx={ctx} />; break;
    default: body = <Standard q={quote} ctx={ctx} />;
  }
  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>{body}</div>
    </AbsoluteFill>
  );
};

const Attribution: React.FC<{ q: QuoteSpec; spring: number; ctx: Ctx }> = ({ q, spring, ctx: { sg } }) => {
  if (!q.attribution) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 40, opacity: spring, transform: `translateY(${interpolate(spring, [0, 1], [16, 0])}px)` }}>
      <div style={{ width: 48, height: 2, background: sg.color.primary }} />
      <div>
        <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.body, fontWeight: 700, color: sg.color.text }}>{q.attribution}</div>
        {q.role && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.textMuted, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase", marginTop: 4 }}>{q.role}</div>}
      </div>
    </div>
  );
};

// ─── standard ───────────────────────────────────────────────────────────────────

const Standard: React.FC<{ q: QuoteSpec; ctx: Ctx }> = ({ q, ctx }) => {
  const { sg, frame, fps } = ctx;
  const size = q.quote.length > 220 ? sg.typography.scale.h4 : q.quote.length > 120 ? sg.typography.scale.h3 : sg.typography.scale.h2;
  const markS = springFrom(frame, fps, 0, { damping: 26, stiffness: 110 });
  const quoteS = springFrom(frame, fps, 8, { damping: 20, stiffness: 78 });
  const attrS = springFrom(frame, fps, 24, { damping: 22, stiffness: 100 });
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 55% 45% at 44% 48%, rgba(207,52,52,0.06) 0%, transparent 70%)", opacity: quoteS }} />
      <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx * 1.5, top: "50%", transform: "translateY(-50%)" }}>
        <div style={{ fontFamily: syneFontFamily, fontSize: 220, fontWeight: 800, color: sg.color.primary, lineHeight: 0.7, height: 120, opacity: interpolate(markS, [0, 1], [0, 0.9]) }}>&ldquo;</div>
        <div style={{ fontFamily: syneFontFamily, fontSize: size, fontWeight: 700, color: sg.color.text, letterSpacing: sg.typography.tracking.h3, lineHeight: 1.18, maxWidth: 1400, opacity: quoteS, transform: `translateY(${interpolate(quoteS, [0, 1], [36, 0])}px)` }}>{q.quote}</div>
        <Attribution q={q} spring={attrS} ctx={ctx} />
      </div>
    </>
  );
};

// ─── portrait (quote beside speaker photo) ──────────────────────────────────────

const Portrait: React.FC<{ q: QuoteSpec; ctx: Ctx }> = ({ q, ctx }) => {
  const { sg, frame, fps } = ctx;
  const src = resolveSrc(q.portrait?.src);
  const imgS = springFrom(frame, fps, 2, { damping: 24, stiffness: 80 });
  const quoteS = springFrom(frame, fps, 12, { damping: 20, stiffness: 78 });
  const attrS = springFrom(frame, fps, 26, { damping: 22, stiffness: 100 });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 70, padding: `0 ${sg.layout.safeMarginPx}px` }}>
      <div style={{ flexShrink: 0, width: 520, opacity: imgS, transform: `scale(${interpolate(imgS, [0, 1], [0.95, 1])})` }}>
        <div style={{ border: `1px solid ${sg.color.primary}`, boxShadow: "0 18px 50px rgba(0,0,0,0.6)", background: sg.color.surface }}>
          <div style={{ width: "100%", height: 600, display: "flex", alignItems: "center", justifyContent: "center", background: sg.color.bg, overflow: "hidden" }}>
            {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: q.portrait?.focal ? `${q.portrait.focal.x * 100}% ${q.portrait.focal.y * 100}%` : "50% 35%", filter: "contrast(1.05) saturate(0.9)" }} /> : <div style={{ fontSize: 64, color: sg.color.textMuted, opacity: 0.4 }}>▦</div>}
          </div>
          {q.portrait?.caption && <div style={{ padding: "10px 14px", borderTop: `2px solid ${sg.color.primary}`, fontFamily: spaceMonoFontFamily, fontSize: 12, color: sg.color.textMuted }}>{q.portrait.caption}</div>}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: syneFontFamily, fontSize: 140, fontWeight: 800, color: sg.color.primary, lineHeight: 0.6, height: 70, opacity: 0.9 }}>&ldquo;</div>
        <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h3, fontWeight: 700, color: sg.color.text, lineHeight: 1.2, opacity: quoteS, transform: `translateY(${interpolate(quoteS, [0, 1], [28, 0])}px)` }}>{q.quote}</div>
        <Attribution q={q} spring={attrS} ctx={ctx} />
      </div>
    </div>
  );
};

// ─── kinetic (words stagger in, emphasis pops) ──────────────────────────────────

const Kinetic: React.FC<{ q: QuoteSpec; ctx: Ctx }> = ({ q, ctx }) => {
  const { sg, frame, fps, totalFrames } = ctx;
  const tokens = tokenize(q.quote, q.emphasis);
  const revealEnd = totalFrames * 0.55;
  const per = revealEnd / Math.max(1, tokens.length);
  const attrS = springFrom(frame, fps, revealEnd + 6, { damping: 22, stiffness: 100 });
  return (
    <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, top: "50%", transform: "translateY(-50%)" }}>
      <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, lineHeight: 1.16, letterSpacing: sg.typography.tracking.h2, maxWidth: 1500 }}>
        {tokens.map((t, i) => {
          const s = springFrom(frame, fps, 6 + i * per, { damping: 22, stiffness: 120 });
          return <span key={i} style={{ display: "inline-block", marginRight: "0.28em", color: t.hot ? sg.color.primary : sg.color.text, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)` }}>{t.word}</span>;
        })}
      </div>
      <Attribution q={q} spring={attrS} ctx={ctx} />
    </div>
  );
};

// ─── statement (giant pull-quote, no attribution) ───────────────────────────────

const Statement: React.FC<{ q: QuoteSpec; ctx: Ctx }> = ({ q, ctx }) => {
  const { sg, frame, fps } = ctx;
  const lineS = springFrom(frame, fps, 0, { damping: 28, stiffness: 140 });
  const lines = q.quote.split("\n");
  const tokensByLine = lines.map((l) => tokenize(l, q.emphasis));
  return (
    <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, top: "50%", transform: "translateY(-50%)" }}>
      <div style={{ width: interpolate(lineS, [0, 1], [0, 80]), height: 4, background: sg.color.primary, marginBottom: 32 }} />
      {tokensByLine.map((toks, li) => (
        <div key={li} style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h1, fontWeight: 800, lineHeight: 1.0, letterSpacing: sg.typography.tracking.h1 }}>
          {toks.map((t, i) => {
            const s = springFrom(frame, fps, 8 + (li * 6 + i) * 3, { damping: 20, stiffness: 90 });
            return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", color: t.hot ? sg.color.primary : sg.color.text, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` }}>{t.word}</span>;
          })}
        </div>
      ))}
    </div>
  );
};

// ─── document (leaked memo / cable) ─────────────────────────────────────────────

const Document: React.FC<{ q: QuoteSpec; ctx: Ctx }> = ({ q, ctx }) => {
  const { sg, frame, fps } = ctx;
  const paperS = springFrom(frame, fps, 0, { damping: 24, stiffness: 90 });
  const quoteS = springFrom(frame, fps, 10, { damping: 22, stiffness: 90 });
  const stampS = springFrom(frame, fps, 20, { damping: 14, stiffness: 120 });
  const paper = "#e8e4da";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1180, background: paper, padding: "70px 90px", boxShadow: "0 30px 80px rgba(0,0,0,0.7)", transform: `rotate(-1.2deg) scale(${interpolate(paperS, [0, 1], [0.96, 1])})`, opacity: paperS, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid #1a1a1a`, paddingBottom: 14, marginBottom: 32 }}>
          <span style={{ fontFamily: spaceMonoFontFamily, fontSize: 14, color: "#1a1a1a", letterSpacing: 2 }}>{q.source ?? "INTERNAL MEMORANDUM"}</span>
          <span style={{ fontFamily: spaceMonoFontFamily, fontSize: 14, color: "#1a1a1a", letterSpacing: 2 }}>CLASSIFIED</span>
        </div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 38, color: "#15151a", lineHeight: 1.5, opacity: quoteS, transform: `translateY(${interpolate(quoteS, [0, 1], [12, 0])}px)` }}>&ldquo;{q.quote}&rdquo;</div>
        {q.attribution && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 16, color: "#444", marginTop: 28, opacity: quoteS }}>— {q.attribution}{q.role ? `, ${q.role}` : ""}</div>}
        <div style={{ position: "absolute", right: 70, bottom: 40, border: `4px solid ${sg.color.primary}`, color: sg.color.primary, fontFamily: syneFontFamily, fontWeight: 800, fontSize: 30, letterSpacing: 4, padding: "6px 18px", transform: `rotate(-8deg) scale(${stampS})`, opacity: stampS * 0.85 }}>DECLASSIFIED</div>
      </div>
    </div>
  );
};

/** Builds a QuoteSpec from a scene's `style` — new `style.quote` object, or legacy flat fields. */
export function styleToQuoteSpec(style: Record<string, any>): QuoteSpec {
  if (style.quote && typeof style.quote === "object") return style.quote as QuoteSpec;
  return { mode: "standard", quote: style.quote ?? "", attribution: style.attribution, role: style.role };
}
