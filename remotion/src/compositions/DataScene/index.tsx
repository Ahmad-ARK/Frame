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

// ─── Resolved DataSpec (what this scene renders; built by Root/enrich) ──────────

export type DataMode = "bigStat" | "barChart" | "compare" | "pictograph" | "donut" | "trend";
export type DataColor = "primary" | "accent" | string;

export type DataBar = { label: string; value: number; sublabel?: string; color?: DataColor };
export type DataItem = { label: string; value: number; prefix?: string; suffix?: string; sublabel?: string; color?: DataColor };
export type DataSlice = { label: string; value: number; color?: DataColor };
export type DataPoint = { x: string | number; y: number };

export type DataSpec = {
  mode: DataMode;
  title?: string;
  label?: string;
  context?: string;
  accent?: DataColor;
  // bigStat
  value?: number;
  prefix?: string;
  suffix?: string;
  // barChart
  bars?: DataBar[];
  max?: number;
  // compare
  items?: DataItem[];
  // pictograph
  percent?: number;
  numerator?: number;
  denominator?: number;
  iconLabel?: string;
  // donut
  slices?: DataSlice[];
  // trend
  points?: DataPoint[];
  lineLabel?: string;
};

export type DataSceneProps = { durationMs: number; data: DataSpec };

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number };

const fmt = (n: number) => (Number.isInteger(n) ? Math.round(n).toLocaleString() : n.toFixed(1));

// ─── Component ──────────────────────────────────────────────────────────────────

export const DataScene: React.FC<DataSceneProps> = ({ durationMs, data }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const ctx: Ctx = { sg, frame, fps, totalFrames };

  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const resolve = (c?: string) => (c === "accent" ? sg.color.accent : c === "primary" || !c ? sg.color.primary : c);

  let body: React.ReactNode;
  switch (data.mode) {
    case "barChart": body = <BarChart data={data} ctx={ctx} resolve={resolve} />; break;
    case "compare": body = <CompareStat data={data} ctx={ctx} resolve={resolve} />; break;
    case "pictograph": body = <Pictograph data={data} ctx={ctx} resolve={resolve} />; break;
    case "donut": body = <Donut data={data} ctx={ctx} resolve={resolve} />; break;
    case "trend": body = <Trend data={data} ctx={ctx} resolve={resolve} />; break;
    default: body = <BigStat data={data} ctx={ctx} resolve={resolve} />;
  }

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>
        {data.title && <Kicker text={data.title} ctx={ctx} />}
        {body}
        {data.label && <Footer text={data.label} ctx={ctx} />}
      </div>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ text: string; ctx: Ctx }> = ({ text, ctx: { sg, frame, fps } }) => {
  const s = springFrom(frame, fps, 4, { damping: 22, stiffness: 100 });
  return (
    <div style={{ position: "absolute", top: sg.layout.safeMarginPx, left: sg.layout.safeMarginPx, fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.primary, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase", opacity: s, transform: `translateY(${interpolate(s, [0, 1], [10, 0])}px)` }}>{text}</div>
  );
};

const Footer: React.FC<{ text: string; ctx: Ctx }> = ({ text, ctx: { sg, frame, fps } }) => {
  const s = springFrom(frame, fps, 30, { damping: 22, stiffness: 90 });
  return (
    <div style={{ position: "absolute", bottom: sg.layout.safeMarginPx, left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.textMuted, letterSpacing: 1, opacity: s }}>{text}</div>
  );
};

// ─── bigStat ────────────────────────────────────────────────────────────────────

const BigStat: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps, totalFrames }, resolve }) => {
  const color = resolve(data.accent);
  const end = Math.round(totalFrames * 0.6);
  const v = interpolate(frame, [8, end], [0, data.value ?? 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const numS = springFrom(frame, fps, 8, { damping: 18, stiffness: 80 });
  const lineP = interpolate(frame, [end, end + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctxS = springFrom(frame, fps, 44, { damping: 22, stiffness: 95 });
  return (
    <div style={{ position: "absolute", left: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, top: "50%", transform: "translateY(-50%)" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 700, height: 400, background: `radial-gradient(ellipse 60% 60% at 50% 50%, ${color}14 0%, transparent 70%)` }} />
      <div style={{ display: "flex", alignItems: "baseline", opacity: numS, transform: `translateY(${interpolate(numS, [0, 1], [28, 0])}px)` }}>
        {data.prefix && <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, color }}>{data.prefix}</span>}
        <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h1, fontWeight: 800, color: sg.color.text, letterSpacing: sg.typography.tracking.h1, lineHeight: 1 }}>{fmt(v)}</span>
        {data.suffix && <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, color, marginLeft: 8 }}>{data.suffix}</span>}
      </div>
      <div style={{ width: interpolate(lineP, [0, 1], [0, 240]), height: 2, background: color, margin: "20px 0" }} />
      {data.context && <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.body, color: sg.color.textMuted, maxWidth: 760, lineHeight: 1.5, opacity: ctxS }}>{data.context}</div>}
    </div>
  );
};

// ─── barChart ───────────────────────────────────────────────────────────────────

const BarChart: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps }, resolve }) => {
  const bars = data.bars ?? [];
  const maxV = data.max ?? Math.max(1, ...bars.map((b) => b.value));
  const LABEL_W = 300, BAR_H = 54, GAP = 20;
  const maxBarW = 1920 - sg.layout.safeMarginPx * 2 - LABEL_W - 180;
  const totalH = bars.length * (BAR_H + GAP);
  const topY = (1080 - totalH) / 2 + 30;
  return (
    <>
      {bars.map((b, i) => {
        const enter = 10 + i * msToFrames(sg.motion.signatures.staggerMs ?? 120, fps);
        const s = springFrom(frame, fps, enter, { damping: 20, stiffness: 85 });
        const w = (b.value / maxV) * maxBarW * s;
        const color = resolve(b.color);
        const y = topY + i * (BAR_H + GAP);
        return (
          <div key={i} style={{ position: "absolute", left: sg.layout.safeMarginPx, top: y }}>
            <div style={{ position: "absolute", left: 0, top: (BAR_H - 24) / 2, width: LABEL_W - 16, textAlign: "right", fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.caption, fontWeight: 500, color: sg.color.text, opacity: s }}>
              {b.label}
              {b.sublabel && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 11, color: sg.color.textMuted, marginTop: 2 }}>{b.sublabel}</div>}
            </div>
            <div style={{ position: "absolute", left: LABEL_W, top: (BAR_H - 42) / 2, width: maxBarW, height: 42, background: sg.color.surface, borderRadius: 3 }} />
            <div style={{ position: "absolute", left: LABEL_W, top: (BAR_H - 42) / 2, width: Math.max(4, w), height: 42, background: color, borderRadius: 3, boxShadow: `0 0 12px ${color}44` }} />
            <div style={{ position: "absolute", left: LABEL_W + Math.max(4, w) + 14, top: (BAR_H - 22) / 2, fontFamily: spaceMonoFontFamily, fontSize: 16, fontWeight: 700, color, whiteSpace: "nowrap", opacity: s }}>{fmt(b.value * s)}</div>
          </div>
        );
      })}
    </>
  );
};

// ─── compare (magnitudes vs) ────────────────────────────────────────────────────

const CompareStat: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps, totalFrames }, resolve }) => {
  const items = (data.items ?? []).slice(0, 3);
  const end = Math.round(totalFrames * 0.55);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-around" }}>
      {items.map((it, i) => {
        const s = springFrom(frame, fps, 10 + i * 12, { damping: 20, stiffness: 85 });
        const v = interpolate(frame, [12 + i * 12, end], [0, it.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const color = resolve(it.color ?? (i === 0 ? "accent" : "primary"));
        return (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.h4, color: sg.color.textMuted, opacity: s }}>vs</div>}
            <div style={{ textAlign: "center", opacity: s, transform: `translateY(${interpolate(s, [0, 1], [20, 0])}px)` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                {it.prefix && <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h3, fontWeight: 800, color }}>{it.prefix}</span>}
                <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h1, fontWeight: 800, color, letterSpacing: sg.typography.tracking.h1, lineHeight: 1 }}>{fmt(v)}</span>
                {it.suffix && <span style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h3, fontWeight: 800, color, marginLeft: 6 }}>{it.suffix}</span>}
              </div>
              <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 700, color: sg.color.text, marginTop: 14, letterSpacing: sg.typography.tracking.h4 }}>{it.label}</div>
              {it.sublabel && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.textMuted, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>{it.sublabel}</div>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── pictograph (icon array — "X in Y" / percent) ───────────────────────────────

const Pictograph: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps, totalFrames }, resolve }) => {
  const color = resolve(data.accent);
  const cols = 10, rows = 10, total = cols * rows;
  const pct = data.percent ?? (data.numerator && data.denominator ? (data.numerator / data.denominator) * 100 : 0);
  const filledTarget = Math.round((pct / 100) * total);
  const fillEnd = Math.round(totalFrames * 0.55);
  const filledNow = Math.round(interpolate(frame, [12, fillEnd], [0, filledTarget], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const cell = 46, gap = 10;
  const gridW = cols * cell + (cols - 1) * gap;
  const numS = springFrom(frame, fps, 10, { damping: 18, stiffness: 80 });
  const liveValue = Math.round(interpolate(frame, [12, fillEnd], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 80 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
        {Array.from({ length: total }, (_, i) => {
          const on = i < filledNow;
          return <div key={i} style={{ width: cell, height: cell, borderRadius: 4, background: on ? color : sg.color.surface, boxShadow: on ? `0 0 10px ${color}55` : "none", transition: "none" }} />;
        })}
        {/* keep grid width stable */}
        <div style={{ position: "absolute", width: gridW }} />
      </div>
      <div style={{ maxWidth: 520, opacity: numS, transform: `translateX(${interpolate(numS, [0, 1], [24, 0])}px)` }}>
        <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h1, fontWeight: 800, color, lineHeight: 1 }}>{liveValue}%</div>
        {data.iconLabel && <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 500, color: sg.color.text, marginTop: 16, lineHeight: 1.3 }}>{data.iconLabel}</div>}
        {data.context && <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.body, color: sg.color.textMuted, marginTop: 14, lineHeight: 1.5 }}>{data.context}</div>}
      </div>
    </div>
  );
};

// ─── donut (share of a whole) ───────────────────────────────────────────────────

const Donut: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps, totalFrames }, resolve }) => {
  const slices = data.slices ?? [];
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const sweep = interpolate(frame, [12, Math.round(totalFrames * 0.55)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const R = 230, r = 140, cx = 640, cy = 540;
  const palette = sg.color.chart ?? [sg.color.primary, sg.color.accent];
  let acc = 0;
  const arcs = slices.map((s, i) => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += s.value;
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const a1c = a0 + (a1 - a0) * sweep;
    const large = a1c - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0o, y0o] = p(a0, R), [x1o, y1o] = p(a1c, R), [x1i, y1i] = p(a1c, r), [x0i, y0i] = p(a0, r);
    const d = `M ${x0o} ${y0o} A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r} ${r} 0 ${large} 0 ${x0i} ${y0i} Z`;
    return { d, color: resolve(s.color ?? palette[i % palette.length]), slice: s };
  });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 70 }}>
      <svg width={1280} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={0.92} />)}
      </svg>
      <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)", textAlign: "center", fontFamily: syneFontFamily, fontWeight: 800, color: sg.color.text, fontSize: sg.typography.scale.h3 }}>{data.context}</div>
      <div style={{ position: "absolute", left: cx + R + 60, top: cy, transform: "translateY(-50%)" }}>
        {slices.map((s, i) => {
          const en = springFrom(frame, fps, 20 + i * 8, { damping: 22, stiffness: 95 });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, opacity: en }}>
              <div style={{ width: 18, height: 18, borderRadius: 3, background: resolve(s.color ?? palette[i % palette.length]) }} />
              <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.body, color: sg.color.text }}>{s.label}</div>
              <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.caption, color: sg.color.textMuted, marginLeft: 8 }}>{Math.round((s.value / total) * 100)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── trend (value over time) ────────────────────────────────────────────────────

const Trend: React.FC<{ data: DataSpec; ctx: Ctx; resolve: (c?: string) => string }> = ({ data, ctx: { sg, frame, fps, totalFrames }, resolve }) => {
  const pts = data.points ?? [];
  const color = resolve(data.accent);
  const x0 = sg.layout.safeMarginPx + 60, x1 = 1920 - sg.layout.safeMarginPx;
  const y0 = 760, y1 = 240;
  const maxY = Math.max(1, ...pts.map((p) => p.y));
  const draw = interpolate(frame, [12, Math.round(totalFrames * 0.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const screen = pts.map((p, i) => [x0 + (i / Math.max(1, pts.length - 1)) * (x1 - x0), y0 - (p.y / maxY) * (y0 - y1)] as [number, number]);
  const shown = Math.max(2, Math.ceil(draw * screen.length));
  const partial = screen.slice(0, shown);
  const headFrac = draw * (screen.length - 1);
  const hi = Math.min(Math.floor(headFrac), screen.length - 2);
  const hf = headFrac - hi;
  const head: [number, number] = screen.length > 1 ? [screen[hi][0] + (screen[hi + 1][0] - screen[hi][0]) * hf, screen[hi][1] + (screen[hi + 1][1] - screen[hi][1]) * hf] : screen[0];
  const path = partial.length ? "M " + partial.map((p) => p.join(" ")).join(" L ") + ` L ${head[0]} ${head[1]}` : "";
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={sg.color.surface} strokeWidth={2} />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={sg.color.surface} strokeWidth={2} />
      {path && <path d={path} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
      {draw > 0.02 && <><circle cx={head[0]} cy={head[1]} r={10} fill={color} opacity={0.25} /><circle cx={head[0]} cy={head[1]} r={5} fill={color} /></>}
      {pts.map((p, i) => {
        if (i / Math.max(1, pts.length - 1) > draw + 0.02) return null;
        return <text key={i} x={screen[i][0]} y={y0 + 30} fill={sg.color.textMuted} fontSize={14} fontFamily={spaceMonoFontFamily} textAnchor="middle">{String(p.x)}</text>;
      })}
    </svg>
  );
};

/** Builds a DataSpec from a scene's `style` — new `style.data`, or legacy stat/chart fields. */
export function styleToDataSpec(style: Record<string, any>): DataSpec {
  if (style.data && typeof style.data === "object") return style.data as DataSpec;
  // legacy StatScene shape
  if (style.mode === "barChart") {
    return {
      mode: "barChart", title: style.chartTitle, label: style.label,
      bars: (style.chartData ?? []).map((d: any) => ({ label: d.label, value: d.value, sublabel: d.sublabel, color: d.color })),
      max: style.chartMax,
    };
  }
  return {
    mode: "bigStat", value: style.numericValue ?? 0, prefix: style.valuePrefix, suffix: style.valueSuffix,
    context: style.context, label: style.label, title: style.chartTitle, accent: style.accentColor,
  };
}
