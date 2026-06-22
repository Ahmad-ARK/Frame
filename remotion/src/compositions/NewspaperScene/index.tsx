import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();
const { fontFamily: serifFontFamily } = loadPlayfair();

export type NewspaperMode = "headline" | "clipping" | "montage";
export type NewspaperHeadline = { headline: string; paper?: string; date?: string };
export type NewspaperSpec = {
  mode: NewspaperMode;
  paper?: string;
  headline?: string;
  dek?: string;
  date?: string;
  items?: NewspaperHeadline[]; // montage
  clipping?: { src?: string; subject?: string; focal?: { x: number; y: number } };
};

export type NewspaperSceneProps = { durationMs: number; newspaper: NewspaperSpec };

const PAPER = "#e8e4da";
const INK = "#15151a";
const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

export const NewspaperScene: React.FC<NewspaperSceneProps> = ({ durationMs, newspaper }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let body: React.ReactNode;
  if (newspaper.mode === "clipping") body = <Clipping n={newspaper} ctx={ctx} />;
  else if (newspaper.mode === "montage") body = <Montage n={newspaper} ctx={ctx} />;
  else body = <Headline n={newspaper} ctx={ctx} />;

  return <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}><div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>{body}</div></AbsoluteFill>;
};

// ─── headline: a generated front page ──
const Headline: React.FC<{ n: NewspaperSpec; ctx: Ctx }> = ({ n, ctx: { sg, frame, fps } }) => {
  const paperS = springFrom(frame, fps, 0, { damping: 24, stiffness: 90 });
  const headS = springFrom(frame, fps, 8, { damping: 20, stiffness: 85 });
  const dekS = springFrom(frame, fps, 20, { damping: 22, stiffness: 95 });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1320, background: PAPER, padding: "60px 80px", boxShadow: "0 30px 80px rgba(0,0,0,0.7)", transform: `rotate(-0.6deg) scale(${interpolate(paperS, [0, 1], [0.97, 1])})`, opacity: paperS }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `3px double ${INK}`, paddingBottom: 12 }}>
          <span style={{ fontFamily: serifFontFamily, fontSize: 40, fontWeight: 800, color: INK, letterSpacing: 1 }}>{n.paper ?? "THE CHRONICLE"}</span>
          <span style={{ fontFamily: spaceMonoFontFamily, fontSize: 14, color: INK }}>{n.date ?? ""}</span>
        </div>
        <div style={{ fontFamily: serifFontFamily, fontSize: 92, fontWeight: 900, color: INK, lineHeight: 1.02, marginTop: 28, opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [24, 0])}px)` }}>{n.headline}</div>
        {n.dek && <div style={{ fontFamily: serifFontFamily, fontStyle: "italic", fontSize: 30, color: "#3a3a42", marginTop: 20, borderTop: `1px solid ${INK}55`, paddingTop: 16, opacity: dekS }}>{n.dek}</div>}
      </div>
    </div>
  );
};

// ─── clipping: a real newspaper scan ──
const Clipping: React.FC<{ n: NewspaperSpec; ctx: Ctx }> = ({ n, ctx: { sg, frame, fps, totalFrames } }) => {
  const src = resolveSrc(n.clipping?.src);
  const t = Math.min(1, frame / totalFrames);
  const scale = 1.05 + 0.12 * t;
  const enter = springFrom(frame, fps, 0, { damping: 30, stiffness: 60 });
  const objPos = n.clipping?.focal ? `${n.clipping.focal.x * 100}% ${n.clipping.focal.y * 100}%` : "50% 25%";
  const headS = springFrom(frame, fps, 14, { damping: 22, stiffness: 95 });
  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, opacity: enter }}>
        {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objPos, filter: "contrast(1.08) saturate(0.85) sepia(0.12)" }} /> : <AbsoluteFill style={{ background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serifFontFamily, fontSize: 60, color: INK, padding: 120, textAlign: "center" }}>{n.headline ?? "NEWSPAPER"}</AbsoluteFill>}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 80% at 50% 45%, transparent 35%, rgba(11,11,15,0.7) 100%)", pointerEvents: "none" }} />
      {n.headline && (
        <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, bottom: sg.layout.safeMarginPx, opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [16, 0])}px)` }}>
          <div style={{ display: "inline-block", background: sg.color.primary, color: sg.color.text, fontFamily: spaceMonoFontFamily, fontSize: 14, padding: "4px 10px", letterSpacing: 2, marginBottom: 12 }}>{n.paper ?? "PRESS"}{n.date ? ` · ${n.date}` : ""}</div>
          <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h3, fontWeight: 800, color: sg.color.text, background: "rgba(11,11,15,0.7)", padding: "8px 16px", display: "inline-block" }}>{n.headline}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── montage: a flurry of headline cards ──
const Montage: React.FC<{ n: NewspaperSpec; ctx: Ctx }> = ({ n, ctx: { sg, frame, fps } }) => {
  const items = n.items ?? [];
  const rot = [-3, 2, -1.5, 3, -2];
  const pos = [{ l: 140, t: 120 }, { l: 820, t: 230 }, { l: 320, t: 470 }, { l: 980, t: 600 }, { l: 200, t: 740 }];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {items.slice(0, 5).map((it, i) => {
        const s = springFrom(frame, fps, 6 + i * 10, { damping: 18, stiffness: 90 });
        const p = pos[i % pos.length];
        return (
          <div key={i} style={{ position: "absolute", left: p.l, top: p.t, width: 620, background: PAPER, padding: "22px 28px", boxShadow: "0 16px 40px rgba(0,0,0,0.6)", transform: `rotate(${rot[i % rot.length]}deg) scale(${s})`, opacity: s }}>
            <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 12, color: "#555", letterSpacing: 1, borderBottom: `1px solid ${INK}55`, paddingBottom: 6, marginBottom: 10 }}>{it.paper ?? "THE PRESS"}{it.date ? ` · ${it.date}` : ""}</div>
            <div style={{ fontFamily: serifFontFamily, fontSize: 34, fontWeight: 800, color: INK, lineHeight: 1.05 }}>{it.headline}</div>
          </div>
        );
      })}
    </div>
  );
};

export function styleToNewspaperSpec(style: Record<string, any>): NewspaperSpec {
  if (style.newspaper && typeof style.newspaper === "object") return style.newspaper as NewspaperSpec;
  return { mode: "headline", headline: style.headline ?? "", paper: style.paper, dek: style.dek, date: style.date };
}
