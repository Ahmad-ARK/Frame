import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

export type ComparisonSide = {
  label: string;
  value?: string;
  description?: string;
  color?: "primary" | "accent" | string;
};

export type ComparisonSceneProps = {
  durationMs: number;
  heading?: string;
  left?: ComparisonSide;
  right?: ComparisonSide;
};

const PLACEHOLDER_LEFT: ComparisonSide = { label: "Panel A", color: "primary" };
const PLACEHOLDER_RIGHT: ComparisonSide = { label: "Panel B", color: "accent" };

const Panel: React.FC<{
  side: ComparisonSide;
  align: "left" | "right";
  enter: number;
  sg: ReturnType<typeof useStyleGuide>;
}> = ({ side, align, enter, sg }) => {
  const color =
    side.color === "accent" ? sg.color.accent
    : side.color === "primary" || !side.color ? sg.color.primary
    : side.color;
  const dir = align === "left" ? -1 : 1;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-end" : "flex-start",
        textAlign: align === "left" ? "right" : "left",
        padding: "0 72px",
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [dir * 60, 0])}px)`,
      }}
    >
      {/* Top accent rule */}
      <div style={{ width: 64, height: 3, background: color, marginBottom: 28 }} />

      <div
        style={{
          fontFamily: syneFontFamily,
          fontSize: sg.typography.scale.h3,
          fontWeight: 800,
          color: sg.color.text,
          letterSpacing: sg.typography.tracking.h3,
          lineHeight: 1.05,
        }}
      >
        {side.label}
      </div>

      {side.value && (
        <div
          style={{
            fontFamily: syneFontFamily,
            fontSize: sg.typography.scale.h2,
            fontWeight: 800,
            color,
            letterSpacing: sg.typography.tracking.h2,
            lineHeight: 1,
            marginTop: 18,
          }}
        >
          {side.value}
        </div>
      )}

      {side.description && (
        <div
          style={{
            fontFamily: dmSansFontFamily,
            fontSize: sg.typography.scale.body,
            fontWeight: 400,
            color: sg.color.textMuted,
            lineHeight: 1.45,
            marginTop: 20,
            maxWidth: 520,
          }}
        >
          {side.description}
        </div>
      )}
    </div>
  );
};

export const ComparisonScene: React.FC<ComparisonSceneProps> = ({
  durationMs,
  heading,
  left = PLACEHOLDER_LEFT,
  right = PLACEHOLDER_RIGHT,
}) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = msToFrames(durationMs, fps);
  const exitStart = totalFrames - msToFrames(sg.motion.durationsMs.exit, fps);

  const headingSpring = springFrom(frame, fps, 4, { damping: 22, stiffness: 100 });
  const leftSpring = springFrom(frame, fps, 10, { damping: 20, stiffness: 82 });
  const rightSpring = springFrom(frame, fps, 18, { damping: 20, stiffness: 82 });
  const dividerProgress = interpolate(frame, [12, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vsSpring = springFrom(frame, fps, 30, { damping: 18, stiffness: 130 });

  const exitOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>
        {/* Heading */}
        {heading && (
          <div
            style={{
              position: "absolute",
              top: sg.layout.safeMarginPx,
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: spaceMonoFontFamily,
              fontSize: sg.typography.scale.micro,
              color: sg.color.primary,
              letterSpacing: sg.typography.tracking.micro,
              textTransform: "uppercase",
              opacity: headingSpring,
              transform: `translateY(${interpolate(headingSpring, [0, 1], [10, 0])}px)`,
            }}
          >
            {heading}
          </div>
        )}

        {/* Two panels */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Panel side={left} align="left" enter={leftSpring} sg={sg} />
          <Panel side={right} align="right" enter={rightSpring} sg={sg} />
        </div>

        {/* Center divider */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 2,
            height: `${interpolate(dividerProgress, [0, 1], [0, 56])}%`,
            background: `linear-gradient(to bottom, transparent, ${sg.color.surface}, transparent)`,
          }}
        />

        {/* VS chip */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${vsSpring})`,
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: sg.color.surface,
            border: `1px solid ${sg.color.textMuted}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: spaceMonoFontFamily,
            fontSize: 16,
            fontWeight: 700,
            color: sg.color.textMuted,
            letterSpacing: 1,
          }}
        >
          VS
        </div>
      </div>
    </AbsoluteFill>
  );
};
