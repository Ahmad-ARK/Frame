import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: monoFontFamily } = loadSpaceMono();

export type DocumentMode = "typed" | "scan" | "redacted";
export type DocumentSpec = {
  mode: DocumentMode;
  title?: string; // e.g. "MEMORANDUM"
  source?: string; // "CIA · 1979"
  lines?: string[]; // body lines
  highlight?: string; // a key passage to box/highlight (substring of a line)
  highlightAtMs?: number; // when the highlight lights up (word-synced); default early
  stamp?: string; // "DECLASSIFIED"
  redactions?: number[]; // which line indices are blacked out (redacted mode)
  scan?: { src?: string; subject?: string; focal?: { x: number; y: number } };
};

export type DocumentSceneProps = { durationMs: number; document: DocumentSpec };

const PAPER = "#e8e4da";
const INK = "#1a1a20";
const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);
type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

export const DocumentScene: React.FC<DocumentSceneProps> = ({ durationMs, document: doc }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const body = doc.mode === "scan" ? <Scan d={doc} ctx={ctx} /> : <Paper d={doc} ctx={ctx} redacted={doc.mode === "redacted"} />;
  return <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}><div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>{body}</div></AbsoluteFill>;
};

// ─── typed / redacted: a generated document page ──
const Paper: React.FC<{ d: DocumentSpec; ctx: Ctx; redacted: boolean }> = ({ d, ctx: { sg, frame, fps, totalFrames }, redacted }) => {
  const paperS = springFrom(frame, fps, 0, { damping: 24, stiffness: 90 });
  const lines = d.lines ?? [];
  // Highlight lights up at the cued spoken moment (or early by default).
  const hlFrame = msToFrames(d.highlightAtMs ?? 800, fps);
  const hlOn = interpolate(frame, [hlFrame, hlFrame + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const reveal = redacted ? 0 : interpolate(frame, [10, totalFrames * 0.5], [0, lines.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const redactSet = new Set(d.redactions ?? (redacted ? lines.map((_, i) => i).filter((i) => !lineHasHighlight(lines[i], d.highlight)) : []));
  const stampS = springFrom(frame, fps, 22, { damping: 14, stiffness: 120 });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1180, minHeight: 620, background: PAPER, padding: "60px 80px", boxShadow: "0 30px 80px rgba(0,0,0,0.7)", transform: `rotate(-1deg) scale(${interpolate(paperS, [0, 1], [0.97, 1])})`, opacity: paperS, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${INK}`, paddingBottom: 12, marginBottom: 28 }}>
          <span style={{ fontFamily: monoFontFamily, fontSize: 15, color: INK, letterSpacing: 2, fontWeight: 700 }}>{d.title ?? "MEMORANDUM"}</span>
          <span style={{ fontFamily: monoFontFamily, fontSize: 13, color: INK, letterSpacing: 2 }}>{d.source ?? "CONFIDENTIAL"}</span>
        </div>
        {lines.map((line, i) => {
          const shown = redacted || i < reveal;
          const isRedacted = redactSet.has(i);
          const hot = lineHasHighlight(line, d.highlight);
          return (
            <div key={i} style={{ position: "relative", marginBottom: 14, opacity: shown ? 1 : 0 }}>
              <div style={{ fontFamily: monoFontFamily, fontSize: 22, color: hot ? INK : "#33333a", lineHeight: 1.5, background: hot ? `rgba(240,192,64,${0.33 * hlOn})` : "transparent", display: "inline" }}>{line}</div>
              {isRedacted && <div style={{ position: "absolute", inset: "-2px -4px", background: INK }} />}
            </div>
          );
        })}
        {d.stamp && <div style={{ position: "absolute", right: 70, bottom: 44, border: `4px solid ${sg.color.primary}`, color: sg.color.primary, fontFamily: syneFontFamily, fontWeight: 800, fontSize: 28, letterSpacing: 4, padding: "6px 16px", transform: `rotate(-8deg) scale(${stampS})`, opacity: stampS * 0.85 }}>{d.stamp}</div>}
      </div>
    </div>
  );
};

function lineHasHighlight(line: string, hl?: string): boolean {
  if (!hl) return false;
  return line.toLowerCase().includes(hl.toLowerCase().slice(0, 24));
}

// ─── scan: a real document image ──
const Scan: React.FC<{ d: DocumentSpec; ctx: Ctx }> = ({ d, ctx: { sg, frame, fps, totalFrames } }) => {
  const src = resolveSrc(d.scan?.src);
  const t = Math.min(1, frame / totalFrames);
  const enter = springFrom(frame, fps, 0, { damping: 30, stiffness: 60 });
  const objPos = d.scan?.focal ? `${d.scan.focal.x * 100}% ${d.scan.focal.y * 100}%` : "50% 20%";
  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${1.04 + 0.12 * t})`, opacity: enter }}>
        {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objPos, filter: "contrast(1.1) saturate(0.8) sepia(0.15)" }} /> : <Paper d={d} ctx={{ sg, frame, fps, totalFrames }} redacted={false} />}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 80% at 50% 45%, transparent 35%, rgba(11,11,15,0.75) 100%)", pointerEvents: "none" }} />
      {d.highlight && (
        <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, bottom: sg.layout.safeMarginPx, opacity: springFrom(frame, fps, 16, { damping: 22, stiffness: 95 }) }}>
          <div style={{ display: "inline-block", background: sg.color.primary, color: sg.color.text, fontFamily: monoFontFamily, fontSize: 13, padding: "4px 10px", letterSpacing: 2, marginBottom: 10 }}>{d.source ?? "DOCUMENT"}</div>
          <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 800, color: sg.color.text, background: "rgba(11,11,15,0.72)", padding: "8px 16px", display: "inline-block", maxWidth: 1200 }}>&ldquo;{d.highlight}&rdquo;</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export function styleToDocumentSpec(style: Record<string, any>): DocumentSpec {
  if (style.document && typeof style.document === "object") return style.document as DocumentSpec;
  return { mode: "typed", title: style.title, source: style.source, lines: style.lines ?? [], highlight: style.highlight, stamp: style.stamp };
}
