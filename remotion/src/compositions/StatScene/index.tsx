import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

export type BarDatum = {
  label: string;
  value: number;
  sublabel?: string;
  color?: "primary" | "accent" | string;
};

export type StatSceneProps = {
  durationMs: number;
  mode: "bigStat" | "barChart";
  // bigStat
  valuePrefix?: string;
  numericValue?: number;
  valueSuffix?: string;
  label: string;
  context?: string;
  accentColor?: "primary" | "accent";
  // barChart
  chartTitle?: string;
  chartData?: BarDatum[];
  chartMax?: number;
};

// ─── BigStat mode ─────────────────────────────────────────────────────────────

const BigStat: React.FC<StatSceneProps & { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number }> = ({
  valuePrefix, numericValue = 0, valueSuffix, label, context, accentColor = "primary",
  sg, frame, fps, totalFrames,
}) => {
  const color = accentColor === "accent" ? sg.color.accent : sg.color.primary;
  const exitStart = totalFrames - msToFrames(sg.motion.durationsMs.exit, fps);

  // Number counts up over ~65% of scene
  const countUpEnd = Math.round(totalFrames * 0.65);
  const countedValue = interpolate(frame, [8, countUpEnd], [0, numericValue], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const displayValue = numericValue % 1 === 0
    ? Math.round(countedValue).toLocaleString()
    : countedValue.toFixed(1);

  // Staggered entrances
  const prefixSpring = springFrom(frame, fps, 5, { damping: 22, stiffness: 100 });
  const numberSpring = springFrom(frame, fps, 8, { damping: 18, stiffness: 80 });
  const suffixSpring = springFrom(frame, fps, 14, { damping: 22, stiffness: 100 });
  const lineProgress = interpolate(frame, [30, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelSpring = springFrom(frame, fps, 38, { damping: 22, stiffness: 95 });
  const contextSpring = springFrom(frame, fps, 52, { damping: 22, stiffness: 95 });

  const exitOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{
      position: "absolute",
      left: sg.layout.safeMarginPx,
      right: sg.layout.safeMarginPx,
      top: "50%",
      transform: "translateY(-50%)",
      opacity: exitOpacity,
    }}>
      {/* Radial glow behind number */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 600,
        height: 400,
        background: `radial-gradient(ellipse 60% 60% at 50% 50%, ${color}12 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Big number */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: 0,
        marginBottom: 24,
      }}>
        {valuePrefix && (
          <span style={{
            fontFamily: syneFontFamily,
            fontSize: sg.typography.scale.h2,
            fontWeight: 800,
            color,
            letterSpacing: -2,
            opacity: prefixSpring,
            transform: `translateY(${interpolate(prefixSpring, [0, 1], [20, 0])}px)`,
            display: "inline-block",
          }}>
            {valuePrefix}
          </span>
        )}
        <span style={{
          fontFamily: syneFontFamily,
          fontSize: sg.typography.scale.h1,
          fontWeight: 800,
          color: sg.color.text,
          letterSpacing: sg.typography.tracking.h1,
          lineHeight: 1,
          opacity: numberSpring,
          transform: `translateY(${interpolate(numberSpring, [0, 1], [32, 0])}px)`,
          display: "inline-block",
        }}>
          {displayValue}
        </span>
        {valueSuffix && (
          <span style={{
            fontFamily: syneFontFamily,
            fontSize: sg.typography.scale.h2,
            fontWeight: 800,
            color,
            letterSpacing: -2,
            marginLeft: 8,
            opacity: suffixSpring,
            transform: `translateY(${interpolate(suffixSpring, [0, 1], [20, 0])}px)`,
            display: "inline-block",
          }}>
            {valueSuffix}
          </span>
        )}
      </div>

      {/* Animated divider line */}
      <div style={{
        width: `${interpolate(lineProgress, [0, 1], [0, 240])}px`,
        height: 2,
        background: color,
        marginBottom: 20,
      }} />

      {/* Label */}
      <div style={{
        fontFamily: syneFontFamily,
        fontSize: sg.typography.scale.h3,
        fontWeight: 700,
        color: sg.color.text,
        letterSpacing: sg.typography.tracking.h3,
        marginBottom: context ? 12 : 0,
        opacity: labelSpring,
        transform: `translateY(${interpolate(labelSpring, [0, 1], [16, 0])}px)`,
      }}>
        {label}
      </div>

      {/* Context line */}
      {context && (
        <div style={{
          fontFamily: dmSansFontFamily,
          fontSize: sg.typography.scale.body,
          fontWeight: 400,
          color: sg.color.textMuted,
          maxWidth: 700,
          lineHeight: 1.5,
          opacity: contextSpring,
          transform: `translateY(${interpolate(contextSpring, [0, 1], [12, 0])}px)`,
        }}>
          {context}
        </div>
      )}
    </div>
  );
};

// ─── BarChart mode ─────────────────────────────────────────────────────────────

const BAR_H = 52;
const BAR_GAP = 18;
const LABEL_W = 280;
const VALUE_W = 160;

const BarChart: React.FC<StatSceneProps & { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number }> = ({
  chartTitle, chartData = [], chartMax, label,
  sg, frame, fps, totalFrames,
}) => {
  const maxValue = chartMax ?? Math.max(...chartData.map(d => d.value));
  const maxBarW = 1920 - sg.layout.safeMarginPx * 2 - LABEL_W - VALUE_W - 48;

  const titleSpring = springFrom(frame, fps, 4, { damping: 22, stiffness: 100 });
  const exitStart = totalFrames - msToFrames(sg.motion.durationsMs.exit, fps);
  const exitOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const resolveColor = (c?: string) =>
    c === "accent" ? sg.color.accent
    : c === "primary" || !c ? sg.color.primary
    : c;

  const totalRowH = chartData.length * (BAR_H + BAR_GAP);
  const titleH = chartTitle ? 72 : 0;
  const totalH = titleH + totalRowH + 40;
  const topY = (1080 - totalH) / 2;

  return (
    <div style={{ opacity: exitOpacity }}>
      {chartTitle && (
        <div style={{
          position: "absolute",
          left: sg.layout.safeMarginPx,
          top: topY,
          fontFamily: spaceMonoFontFamily,
          fontSize: sg.typography.scale.micro,
          fontWeight: 400,
          color: sg.color.primary,
          letterSpacing: sg.typography.tracking.micro,
          textTransform: "uppercase" as const,
          opacity: titleSpring,
        }}>
          {chartTitle}
        </div>
      )}

      {chartData.map((datum, i) => {
        const enterFrame = 10 + i * msToFrames(sg.motion.signatures.staggerMs ?? 120, fps);
        const barSpring = springFrom(frame, fps, enterFrame, { damping: 20, stiffness: 85 });
        const barW = (datum.value / maxValue) * maxBarW;
        const currentW = barW * barSpring;
        const color = resolveColor(datum.color);
        const rowY = topY + titleH + i * (BAR_H + BAR_GAP);

        return (
          <div key={i} style={{ position: "absolute", left: sg.layout.safeMarginPx, top: rowY }}>
            {/* Label */}
            <div style={{
              position: "absolute",
              left: 0,
              top: (BAR_H - 22) / 2,
              width: LABEL_W - 16,
              fontFamily: dmSansFontFamily,
              fontSize: sg.typography.scale.caption,
              fontWeight: 500,
              color: sg.color.text,
              textAlign: "right" as const,
              opacity: barSpring,
            }}>
              {datum.label}
              {datum.sublabel && (
                <div style={{
                  fontFamily: spaceMonoFontFamily,
                  fontSize: 11,
                  color: sg.color.textMuted,
                  marginTop: 2,
                }}>
                  {datum.sublabel}
                </div>
              )}
            </div>

            {/* Bar track */}
            <div style={{
              position: "absolute",
              left: LABEL_W,
              top: (BAR_H - 40) / 2,
              width: maxBarW,
              height: 40,
              background: sg.color.surface,
              borderRadius: 3,
            }} />

            {/* Bar fill */}
            <div style={{
              position: "absolute",
              left: LABEL_W,
              top: (BAR_H - 40) / 2,
              width: Math.max(4, currentW),
              height: 40,
              background: color,
              borderRadius: 3,
              boxShadow: `0 0 12px ${color}44`,
            }} />

            {/* Value label */}
            <div style={{
              position: "absolute",
              left: LABEL_W + Math.max(4, currentW) + 12,
              top: (BAR_H - 22) / 2,
              fontFamily: spaceMonoFontFamily,
              fontSize: 14,
              fontWeight: 700,
              color,
              letterSpacing: 1,
              opacity: barSpring,
              whiteSpace: "nowrap" as const,
            }}>
              {datum.value.toLocaleString()}
            </div>
          </div>
        );
      })}

      {/* Footer label */}
      <div style={{
        position: "absolute",
        left: sg.layout.safeMarginPx,
        bottom: sg.layout.safeMarginPx,
        fontFamily: spaceMonoFontFamily,
        fontSize: sg.typography.scale.micro,
        color: sg.color.textMuted,
        letterSpacing: 1,
        opacity: springFrom(frame, fps, 30, { damping: 22, stiffness: 90 }),
      }}>
        {label}
      </div>
    </div>
  );
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const StatScene: React.FC<StatSceneProps> = (props) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(props.durationMs, fps);

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      {props.mode === "bigStat" ? (
        <BigStat {...props} sg={sg} frame={frame} fps={fps} totalFrames={totalFrames} />
      ) : (
        <BarChart {...props} sg={sg} frame={frame} fps={fps} totalFrames={totalFrames} />
      )}
    </AbsoluteFill>
  );
};
