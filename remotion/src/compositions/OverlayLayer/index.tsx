import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";
import type { Overlay, OverlayAnchor } from "../../types/storyboard";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

const resolveSrc = (s?: string) => (s ? (/^https?:\/\//.test(s) ? s : staticFile(s)) : undefined);

// Anchor → absolute positioning within the safe area.
function anchorStyle(anchor: OverlayAnchor = "right", margin: number): React.CSSProperties {
  const m = margin;
  switch (anchor) {
    case "topLeft": return { top: m, left: m };
    case "topRight": return { top: m, right: m };
    case "bottomLeft": return { bottom: m, left: m };
    case "bottomRight": return { bottom: m, right: m };
    case "left": return { top: "50%", left: m, transform: "translateY(-50%)" };
    case "center": return { top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
    case "right":
    default: return { top: "50%", right: m, transform: "translateY(-50%)" };
  }
}

/**
 * Renders timed overlays (image insets, text callouts, stat chips) on top of a
 * scene's base visual. Each enters with a spring at its atMs, holds, and exits.
 * This is what keeps long scenes alive between the base scene's own beats —
 * something lands on the spoken word rather than the frame sitting static.
 */
export const OverlayLayer: React.FC<{ overlays: Overlay[] }> = ({ overlays }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const margin = sg.layout.safeMarginPx;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 20 }}>
      {overlays.map((ov, i) => {
        const startF = msToFrames(ov.atMs, fps);
        const dur = ov.durationMs ?? 3500;
        const endF = startF + msToFrames(dur, fps);
        if (frame < startF - 2) return null;
        const enter = springFrom(frame, fps, startF, { damping: 24, stiffness: 110 });
        const exit = interpolate(frame, [endF - msToFrames(450, fps), endF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const vis = Math.min(enter, exit);
        if (vis < 0.001) return null;
        const pos = anchorStyle(ov.anchor, margin);

        if (ov.kind === "image") {
          const src = resolveSrc(ov.src);
          return (
            <div key={i} style={{
              position: "absolute", ...pos, width: 520,
              opacity: vis,
              transform: `${pos.transform ?? ""} translateY(${interpolate(enter, [0, 1], [24, 0])}px) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
            }}>
              <div style={{ border: `1px solid ${sg.color.primary}`, boxShadow: "0 18px 50px rgba(0,0,0,0.6)", background: sg.color.surface, overflow: "hidden" }}>
                <div style={{ width: "100%", height: 320, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: sg.color.bg }}>
                  {src ? (
                    <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: (ov as any).focal ? `${(ov as any).focal.x * 100}% ${(ov as any).focal.y * 100}%` : "50% 38%", filter: "contrast(1.05) saturate(0.9)" }} />
                  ) : (
                    <div style={{ fontSize: 52, color: sg.color.textMuted, opacity: 0.5 }}>▦</div>
                  )}
                </div>
                {(ov.caption || ov.attribution) && (
                  <div style={{ padding: "10px 14px", borderTop: `2px solid ${sg.color.primary}` }}>
                    {ov.caption && <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.caption, fontWeight: 700, color: sg.color.text, letterSpacing: sg.typography.tracking.caption }}>{ov.caption}</div>}
                    {ov.attribution && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 10, color: sg.color.textMuted, marginTop: 3 }}>{ov.attribution}</div>}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (ov.kind === "stat") {
          return (
            <div key={i} style={{ position: "absolute", ...pos, opacity: vis, transform: `${pos.transform ?? ""} translateY(${interpolate(enter, [0, 1], [20, 0])}px)`, textAlign: "right" }}>
              <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, color: sg.color.primary, letterSpacing: sg.typography.tracking.h2, lineHeight: 1 }}>{ov.value}</div>
              {ov.label && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.textMuted, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase", marginTop: 6 }}>{ov.label}</div>}
            </div>
          );
        }

        // text callout
        return (
          <div key={i} style={{ position: "absolute", ...pos, maxWidth: 640, opacity: vis, transform: `${pos.transform ?? ""} translateY(${interpolate(enter, [0, 1], [18, 0])}px)` }}>
            <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              <div style={{ width: 4, background: sg.color.primary, flexShrink: 0 }} />
              <div style={{
                fontFamily: ov.emphasis ? syneFontFamily : dmSansFontFamily,
                fontSize: ov.emphasis ? sg.typography.scale.h4 : sg.typography.scale.body,
                fontWeight: ov.emphasis ? 800 : 500,
                color: sg.color.text, lineHeight: 1.2,
                background: "rgba(11,11,15,0.82)", padding: "10px 16px",
              }}>{ov.text}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
