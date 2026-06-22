import React from "react";
import { AbsoluteFill, OffthreadVideo, Video, Img, Freeze, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// ─── Resolved VideoSpec ──────────────────────────────────────────────────────
// Real archival/B-roll footage. Modes chosen from how documentary editors deploy
// motion footage: a single atmospheric establishing clip, a rapid montage to show
// passage/scale, a seamless loop to fill a long beat with a short clip, and a
// freeze-frame "watch this" emphasis on a detail. Footage carries its own motion,
// so the treatments here are restrained (subtle push + grade) — the energy is the
// cuts, the loop, and the freeze, all word-syncable.

export type VideoMode = "single" | "montage" | "loop" | "freeze";
export type VideoClip = {
  src?: string;          // staticFile-relative or http(s)
  subject?: string;      // search query, filled to src by the asset stage
  caption?: string;
  attribution?: string;
  trimBeforeMs?: number; // start offset into the SOURCE clip
  durationMs?: number;   // how long this clip plays (montage slice; ignored for single/loop)
  kind?: "video" | "image"; // image = no authentic footage found; renderer Ken-Burns-pans a still
  focal?: { x: number; y: number }; // subject focal point for image fallbacks (0..1)
};
export type VideoAnnotation = { x: number; y: number; radius?: number; label?: string };
export type VideoSpec = {
  mode: VideoMode;
  clips: VideoClip[];
  treatment?: "grade" | "none";
  freezeAtMs?: number;        // freeze mode: when the picture locks (word-synced)
  annotation?: VideoAnnotation; // freeze mode: the investigative callout
};

export type VideoSceneProps = { durationMs: number; video: VideoSpec };

const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const GRADE = "contrast(1.08) saturate(0.85) brightness(0.92)";

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

const Placeholder: React.FC<{ caption?: string }> = ({ caption }) => {
  const sg = useStyleGuide();
  return (
    <AbsoluteFill style={{ background: `repeating-linear-gradient(45deg, ${sg.color.surface} 0px, ${sg.color.surface} 28px, ${sg.color.bg} 28px, ${sg.color.bg} 56px)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <div style={{ fontSize: 52, opacity: 0.5 }}>▶</div>
      <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.caption, color: sg.color.textMuted, letterSpacing: 3, textTransform: "uppercase" }}>FOOTAGE</div>
      {caption && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 13, color: sg.color.textMuted, letterSpacing: 1, textAlign: "center", padding: "0 60px", opacity: 0.7 }}>{caption}</div>}
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 78% 78% at 50% 45%, transparent 42%, rgba(11,11,15,0.6) 100%)", pointerEvents: "none" }} />
    <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)", pointerEvents: "none", opacity: 0.6 }} />
  </>
);

const LowerThird: React.FC<{ caption?: string; attribution?: string; vis: number }> = ({ caption, attribution, vis }) => {
  const sg = useStyleGuide();
  if ((!caption && !attribution) || vis < 0.001) return null;
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

/** One muted clip filling the frame with a subtle slow push (footage already moves). */
const ClipVideo: React.FC<{ clip: VideoClip; t: number; grade: boolean; loop?: boolean; seed?: number }> = ({ clip, t, grade, loop, seed = 0 }) => {
  const { fps } = useVideoConfig();
  const src = resolveSrc(clip.src);
  if (!src) return <Placeholder caption={clip.caption} />;
  const isImage = clip.kind === "image" || /\.(jpe?g|png|webp|gif)$/i.test(clip.src ?? "");
  // Stills need a bit more travel than footage (which already moves) to feel alive.
  const scale = isImage ? lerp(1.06, 1.2, t) : lerp(1.0, 1.08, t);
  const drift = (seed % 2 === 0 ? 1 : -1) * lerp(0, isImage ? 26 : 16, t);
  const trimBefore = clip.trimBeforeMs ? Math.max(0, msToFrames(clip.trimBeforeMs, fps)) : undefined;
  const vStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", filter: grade ? GRADE : "none" };
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${drift}px)`, overflow: "hidden" }}>
      {isImage ? (
        // No authentic footage was found — Ken Burns a still (archival photo or AI-generated).
        <Img src={src} style={{ ...vStyle, objectPosition: clip.focal ? `${clip.focal.x * 100}% ${clip.focal.y * 100}%` : "50% 42%" }} />
      ) : loop ? (
        // The loop case needs <Video>, the only player that exposes `loop`.
        <Video src={src} muted loop style={vStyle} />
      ) : (
        // OffthreadVideo (ffmpeg frame extraction) is the reliable render path.
        <OffthreadVideo src={src} muted trimBefore={trimBefore} style={vStyle} />
      )}
    </AbsoluteFill>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoScene: React.FC<VideoSceneProps> = ({ durationMs, video }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };
  const grade = video.treatment !== "none";
  const clips = video.clips?.length ? video.clips : [{}];

  const entrance = springFrom(frame, fps, 0, { damping: 30, stiffness: 60 });
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowerThird = springFrom(frame, fps, 10, { damping: 24, stiffness: 90 });

  // ── montage: hard-cut/crossfade through clips, each trimmed, progress dots ──
  if (video.mode === "montage" && clips.length > 1) {
    const slice = totalFrames / clips.length;
    const active = Math.min(clips.length - 1, Math.floor(frame / slice));
    return (
      <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden", opacity: exitOpacity }}>
        {clips.map((c, i) => {
          const startF = i * slice;
          const local = frame - startF;
          const op = interpolate(local, [0, 8, slice - 8, slice], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (op < 0.001) return null;
          return <AbsoluteFill key={i} style={{ opacity: op }}><ClipVideo clip={c} t={Math.min(1, local / slice)} grade={grade} seed={i} /></AbsoluteFill>;
        })}
        {grade && <Vignette />}
        <LowerThird caption={clips[active]?.caption} attribution={clips[active]?.attribution} vis={1} />
        <div style={{ position: "absolute", top: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, display: "flex", gap: 8, zIndex: 10 }}>
          {clips.map((_, i) => <div key={i} style={{ width: 26, height: 3, background: i <= active ? sg.color.primary : sg.color.surface }} />)}
        </div>
      </AbsoluteFill>
    );
  }

  // ── loop: one short clip looped seamlessly to fill the beat ──
  if (video.mode === "loop") {
    const c = clips[0];
    const t = Math.min(1, frame / totalFrames);
    return (
      <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
        <AbsoluteFill style={{ opacity: entrance }}><ClipVideo clip={c} t={t} grade={grade} loop /></AbsoluteFill>
        {grade && c.src && <><Vignette /><AbsoluteFill style={{ background: `linear-gradient(to top, ${sg.color.bg} 2%, ${sg.color.bg}cc 14%, transparent 42%)`, pointerEvents: "none" }} /></>}
        <LowerThird caption={c.caption} attribution={c.attribution} vis={Math.min(lowerThird, exitOpacity)} />
      </AbsoluteFill>
    );
  }

  // ── freeze: play, then lock the picture at freezeAtMs + investigative callout ──
  if (video.mode === "freeze") {
    const c = clips[0];
    const freezeFrame = video.freezeAtMs !== undefined ? Math.min(totalFrames - 1, msToFrames(video.freezeAtMs, fps)) : Math.floor(totalFrames * 0.55);
    const frozen = frame >= freezeFrame;
    const t = Math.min(1, frame / totalFrames);
    const a = video.annotation;
    return (
      <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
        <AbsoluteFill style={{ opacity: entrance }}>
          {frozen
            ? <Freeze frame={freezeFrame}><ClipVideo clip={c} t={freezeFrame / totalFrames} grade={grade} /></Freeze>
            : <ClipVideo clip={c} t={t} grade={grade} />}
        </AbsoluteFill>
        {grade && c.src && <Vignette />}
        {/* desaturate + flash the moment it locks */}
        {frozen && <AbsoluteFill style={{ background: sg.color.text, opacity: interpolate(frame, [freezeFrame, freezeFrame + 4, freezeFrame + 10], [0, 0.22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), pointerEvents: "none" }} />}
        {frozen && a && c.src && (() => {
          const ax = (a.x ?? 0.5) * width, ay = (a.y ?? 0.5) * height, R = (a.radius ?? 0.12) * height;
          const draw = springFrom(frame, fps, freezeFrame + 4, { damping: 20, stiffness: 90 });
          const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 1.5);
          return (
            <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0, zIndex: 9 }}>
              <circle cx={ax} cy={ay} r={R * pulse} fill="none" stroke={sg.color.primary} strokeWidth={4} strokeDasharray={`${2 * Math.PI * R}`} strokeDashoffset={`${2 * Math.PI * R * (1 - draw)}`} transform={`rotate(-90 ${ax} ${ay})`} opacity={0.95} />
              {a.label && draw > 0.6 && (
                <>
                  <line x1={ax + R * 0.7} y1={ay - R * 0.7} x2={ax + R + 80} y2={ay - R - 50} stroke={sg.color.primary} strokeWidth={2} opacity={(draw - 0.6) / 0.4} />
                  <text x={ax + R + 88} y={ay - R - 46} fill={sg.color.text} fontSize={26} fontFamily={syneFontFamily} fontWeight={700} opacity={(draw - 0.6) / 0.4} paintOrder="stroke" stroke={sg.color.bg} strokeWidth={6}>{a.label}</text>
                </>
              )}
            </svg>
          );
        })()}
        <LowerThird caption={c.caption} attribution={c.attribution} vis={Math.min(lowerThird, exitOpacity)} />
      </AbsoluteFill>
    );
  }

  // ── single: one full-bleed clip, subtle push + grade + lower-third ──
  const c = clips[0];
  const t = Math.min(1, frame / totalFrames);
  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: entrance }}><ClipVideo clip={c} t={t} grade={grade} /></AbsoluteFill>
      {grade && c.src && (
        <>
          <Vignette />
          <AbsoluteFill style={{ background: `linear-gradient(to top, ${sg.color.bg} 2%, ${sg.color.bg}cc 14%, transparent 42%)`, pointerEvents: "none" }} />
        </>
      )}
      <LowerThird caption={c.caption} attribution={c.attribution} vis={Math.min(lowerThird, exitOpacity)} />
    </AbsoluteFill>
  );
};

/** Builds a VideoSpec from a scene's `style` (new style.video) or a single legacy asset. */
export function styleToVideoSpec(style: Record<string, any>, legacy?: { src?: string; caption?: string; attribution?: string }): VideoSpec {
  if (style.video && typeof style.video === "object") return style.video as VideoSpec;
  return { mode: "single", clips: [{ src: legacy?.src ?? style.src, caption: legacy?.caption ?? style.caption, attribution: legacy?.attribution ?? style.attribution }] };
}
