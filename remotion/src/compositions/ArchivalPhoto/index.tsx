import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// ─── Resolved PhotoSpec ─────────────────────────────────────────────────────────

export type PhotoMode = "single" | "montage" | "split" | "grid" | "annotated";
export type PhotoItem = { src?: string; subject?: string; caption?: string; attribution?: string; focal?: { x: number; y: number } };
export type PhotoAnnotation = { x: number; y: number; label?: string; radius?: number };
export type PhotoSpec = {
  mode: PhotoMode;
  items: PhotoItem[];
  annotation?: PhotoAnnotation;
  treatment?: "grade" | "none";
};

export type ArchivalPhotoProps = { durationMs: number; photo: PhotoSpec };

const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const GRADE = "contrast(1.06) saturate(0.88) brightness(0.94)";

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

const Placeholder: React.FC<{ caption?: string; ctx: Ctx }> = ({ caption, ctx: { sg } }) => (
  <AbsoluteFill style={{ background: `repeating-linear-gradient(45deg, ${sg.color.surface} 0px, ${sg.color.surface} 28px, ${sg.color.bg} 28px, ${sg.color.bg} 56px)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
    <div style={{ fontSize: 56, opacity: 0.5 }}>▦</div>
    {caption && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.caption, color: sg.color.textMuted, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", padding: "0 60px" }}>{caption}</div>}
  </AbsoluteFill>
);

const Vignette: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 75% at 50% 45%, transparent 40%, rgba(11,11,15,0.55) 100%)", pointerEvents: "none" }} />
    <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)", pointerEvents: "none", opacity: 0.6 }} />
  </>
);

const LowerThird: React.FC<{ caption?: string; attribution?: string; vis: number; ctx: Ctx }> = ({ caption, attribution, vis, ctx: { sg } }) => {
  if (!caption && !attribution) return null;
  return (
    <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, bottom: sg.layout.safeMarginPx - 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, opacity: vis, transform: `translateY(${interpolate(vis, [0, 1], [18, 0])}px)`, zIndex: 10 }}>
      {caption && (
        <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
          <div style={{ width: 4, alignSelf: "stretch", background: sg.color.primary, flexShrink: 0 }} />
          <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 700, color: sg.color.text, letterSpacing: sg.typography.tracking.h4, lineHeight: 1.1, maxWidth: 1100 }}>{caption}</div>
        </div>
      )}
      {attribution && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 11, color: sg.color.textMuted, textAlign: "right", maxWidth: 420, lineHeight: 1.4, opacity: 0.7, flexShrink: 0 }}>{attribution}</div>}
    </div>
  );
};

/** One Ken Burns image filling its parent. seed varies the pan direction. */
const KenBurnsImg: React.FC<{ item: PhotoItem; t: number; grade: boolean; seed?: number }> = ({ item, t, grade, seed = 0 }) => {
  const sg = useStyleGuide();
  const dirs = [
    { from: { s: 1.06, x: -0.25, y: -0.18 }, to: { s: 1.18, x: 0.2, y: 0.15 } },
    { from: { s: 1.2, x: 0.2, y: 0.1 }, to: { s: 1.05, x: -0.15, y: -0.12 } },
    { from: { s: 1.08, x: 0.2, y: -0.2 }, to: { s: 1.2, x: -0.2, y: 0.18 } },
  ][seed % 3];
  const scale = lerp(dirs.from.s, dirs.to.s, t);
  const px = lerp(dirs.from.x, dirs.to.x, t) * 60;
  const py = lerp(dirs.from.y, dirs.to.y, t) * 60;
  const src = resolveSrc(item.src);
  // Content-aware crop: keep the detected subject in frame (fallback: upper-center for heads).
  const objPos = item.focal ? `${item.focal.x * 100}% ${item.focal.y * 100}%` : "50% 38%";
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate(${px}px, ${py}px)`, overflow: "hidden" }}>
      {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objPos, filter: grade ? GRADE : "none" }} /> : <Placeholder caption={item.caption} ctx={{ sg } as any} />}
    </AbsoluteFill>
  );
};

// ─── Component ──────────────────────────────────────────────────────────────────

export const ArchivalPhoto: React.FC<ArchivalPhotoProps> = ({ durationMs, photo }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };
  const grade = photo.treatment !== "none";
  const items = photo.items?.length ? photo.items : [{}];

  const entrance = springFrom(frame, fps, 0, { damping: 30, stiffness: 60 });
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowerThird = springFrom(frame, fps, 10, { damping: 24, stiffness: 90 });

  // ── montage: crossfade through items, each with Ken Burns ──
  if (photo.mode === "montage" && items.length > 1) {
    const slice = totalFrames / items.length;
    const active = Math.min(items.length - 1, Math.floor(frame / slice));
    return (
      <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden", opacity: exitOpacity }}>
        {items.map((it, i) => {
          const startF = i * slice;
          const local = frame - startF;
          const op = interpolate(local, [0, 10, slice - 10, slice], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (op < 0.001) return null;
          return <AbsoluteFill key={i} style={{ opacity: op }}><KenBurnsImg item={it} t={Math.min(1, local / slice)} grade={grade} seed={i} /></AbsoluteFill>;
        })}
        {grade && <Vignette />}
        <LowerThird caption={items[active]?.caption} attribution={items[active]?.attribution} vis={1} ctx={ctx} />
        {/* progress dots */}
        <div style={{ position: "absolute", top: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, display: "flex", gap: 8, zIndex: 10 }}>
          {items.map((_, i) => <div key={i} style={{ width: 26, height: 3, background: i <= active ? sg.color.primary : sg.color.surface }} />)}
        </div>
      </AbsoluteFill>
    );
  }

  // ── split: two images side by side ──
  if (photo.mode === "split") {
    const two = items.slice(0, 2);
    return (
      <AbsoluteFill style={{ background: sg.color.bg, display: "flex", opacity: exitOpacity }}>
        {two.map((it, i) => {
          const s = springFrom(frame, fps, i * 8, { damping: 26, stiffness: 70 });
          return (
            <div key={i} style={{ flex: 1, position: "relative", overflow: "hidden", borderRight: i === 0 ? `2px solid ${sg.color.bg}` : undefined, opacity: s }}>
              <KenBurnsImg item={it} t={Math.min(1, frame / totalFrames)} grade={grade} seed={i + 1} />
              {grade && <AbsoluteFill style={{ background: `linear-gradient(to top, ${sg.color.bg} 2%, transparent 30%)`, pointerEvents: "none" }} />}
              {it.caption && <div style={{ position: "absolute", left: 40, right: 40, bottom: 50, fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 800, color: sg.color.text }}>{it.caption}</div>}
            </div>
          );
        })}
        <Vignette />
      </AbsoluteFill>
    );
  }

  // ── grid: photos pop in sequence ──
  if (photo.mode === "grid" && items.length > 2) {
    const cols = items.length <= 4 ? 2 : 3;
    const rows = Math.ceil(items.length / cols);
    const gap = 14;
    const m = sg.layout.safeMarginPx;
    const cellW = (width - m * 2 - gap * (cols - 1)) / cols;
    const cellH = (height - m * 2 - gap * (rows - 1)) / rows;
    return (
      <AbsoluteFill style={{ background: sg.color.bg, opacity: exitOpacity }}>
        {items.map((it, i) => {
          const r = Math.floor(i / cols), c = i % cols;
          const s = springFrom(frame, fps, 4 + i * 5, { damping: 22, stiffness: 110 });
          if (s < 0.001) return null;
          return (
            <div key={i} style={{ position: "absolute", left: m + c * (cellW + gap), top: m + r * (cellH + gap), width: cellW, height: cellH, overflow: "hidden", opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, border: `1px solid ${sg.color.surface}` }}>
              <KenBurnsImg item={it} t={Math.min(1, frame / totalFrames)} grade={grade} seed={i} />
              {it.caption && <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, fontFamily: spaceMonoFontFamily, fontSize: 12, color: sg.color.text, background: "rgba(11,11,15,0.7)", padding: "3px 6px" }}>{it.caption}</div>}
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }

  // ── single / annotated: one full-bleed Ken Burns image ──
  const it = items[0];
  const t = Math.min(1, frame / totalFrames);
  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: entrance }}><KenBurnsImg item={it} t={t} grade={grade} /></AbsoluteFill>
      {grade && it.src && (
        <>
          <Vignette />
          <AbsoluteFill style={{ background: `linear-gradient(to top, ${sg.color.bg} 2%, ${sg.color.bg}cc 14%, transparent 42%)`, pointerEvents: "none" }} />
        </>
      )}
      {photo.mode === "annotated" && photo.annotation && (() => {
        const a = photo.annotation;
        const ax = (a.x ?? 0.5) * width, ay = (a.y ?? 0.5) * height, R = (a.radius ?? 0.12) * height;
        const draw = springFrom(frame, fps, 18, { damping: 20, stiffness: 90 });
        const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 1.5);
        return (
          <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0, zIndex: 9 }}>
            <circle cx={ax} cy={ay} r={R * pulse} fill="none" stroke={sg.color.primary} strokeWidth={4} strokeDasharray={`${2 * Math.PI * R}`} strokeDashoffset={`${2 * Math.PI * R * (1 - draw)}`} transform={`rotate(-90 ${ax} ${ay})`} opacity={0.95} />
            {a.label && draw > 0.6 && (
              <>
                <line x1={ax + R * 0.7} y1={ay - R * 0.7} x2={ax + R + 80} y2={ay - R - 50} stroke={sg.color.primary} strokeWidth={2} opacity={(draw - 0.6) / 0.4} />
                <text x={ax + R + 88} y={ay - R - 46} fill={sg.color.text} fontSize={26} fontFamily={syneFontFamily} fontWeight={700} opacity={(draw - 0.6) / 0.4} style={{ paintOrder: "stroke" }} stroke={sg.color.bg} strokeWidth={6}>{a.label}</text>
              </>
            )}
          </svg>
        );
      })()}
      <LowerThird caption={it.caption} attribution={it.attribution} vis={Math.min(lowerThird, exitOpacity)} ctx={ctx} />
    </AbsoluteFill>
  );
};

/** Builds a PhotoSpec from a scene's `style` (new style.photo) or a single legacy src/asset. */
export function styleToPhotoSpec(style: Record<string, any>, legacy?: { src?: string; caption?: string; attribution?: string }): PhotoSpec {
  if (style.photo && typeof style.photo === "object") return style.photo as PhotoSpec;
  return { mode: "single", items: [{ src: legacy?.src ?? style.src, caption: legacy?.caption ?? style.caption, attribution: legacy?.attribution ?? style.attribution }] };
}
