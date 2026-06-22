import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: dmSansFontFamily } = loadDmSans();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// ─── Resolved TimelineSpec ──────────────────────────────────────────────────────

export type TimelineMode = "vertical" | "horizontal" | "eras" | "milestones" | "parallel";
export type TLEvent = { date: string; title: string; description?: string; color?: string; atMs?: number };
export type TLEra = { from: string; to: string; label: string; color?: string };
export type TLTrack = { label: string; color?: string; events: TLEvent[] };

export type TimelineSpec = {
  mode: TimelineMode;
  heading?: string;
  events?: TLEvent[];
  eras?: TLEra[];
  tracks?: TLTrack[];
};

export type TimelineSceneProps = { durationMs: number; timeline: TimelineSpec };

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** Parse a date string ("Dec 1979", "1947", "Feb 1989") → fractional year. */
function parseYear(d: string): number {
  const y = /(\d{4})/.exec(d);
  if (!y) return NaN;
  const year = parseInt(y[1], 10);
  const m = /([a-z]{3})/i.exec(d.toLowerCase());
  const month = m && MONTHS[m[1]] !== undefined ? MONTHS[m[1]] : 0;
  return year + month / 12;
}

type Ctx = { sg: ReturnType<typeof useStyleGuide>; frame: number; fps: number; totalFrames: number; resolve: (c?: string) => string };

// ─── Component ──────────────────────────────────────────────────────────────────

export const TimelineScene: React.FC<TimelineSceneProps> = ({ durationMs, timeline }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const resolve = (c?: string) => (c === "accent" ? sg.color.accent : c === "primary" || !c ? sg.color.primary : c);
  const ctx: Ctx = { sg, frame, fps, totalFrames, resolve };

  const exitStart = totalFrames - msToFrames(sg.motion.durationsMs.exit, fps);
  const exitOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let body: React.ReactNode;
  switch (timeline.mode) {
    case "horizontal": body = <Horizontal t={timeline} ctx={ctx} />; break;
    case "eras": body = <Eras t={timeline} ctx={ctx} />; break;
    case "milestones": body = <Milestones t={timeline} ctx={ctx} />; break;
    case "parallel": body = <Parallel t={timeline} ctx={ctx} />; break;
    default: body = <Vertical t={timeline} ctx={ctx} />;
  }

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 3, height: "100%", background: `linear-gradient(to bottom, transparent 10%, ${sg.color.primary}66 50%, transparent 90%)` }} />
      <div style={{ opacity: exitOpacity, width: "100%", height: "100%" }}>
        {timeline.heading && timeline.mode !== "milestones" && <Heading text={timeline.heading} ctx={ctx} />}
        {body}
      </div>
    </AbsoluteFill>
  );
};

const Heading: React.FC<{ text: string; ctx: Ctx }> = ({ text, ctx: { sg, frame, fps } }) => {
  const s = springFrom(frame, fps, 4, { damping: 22, stiffness: 100 });
  return <div style={{ position: "absolute", top: sg.layout.safeMarginPx, left: sg.layout.safeMarginPx, fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.primary, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase", opacity: s, transform: `translateY(${interpolate(s, [0, 1], [10, 0])}px)` }}>{text}</div>;
};

// ─── vertical (legacy look) ─────────────────────────────────────────────────────

const Vertical: React.FC<{ t: TimelineSpec; ctx: Ctx }> = ({ t, ctx: { sg, frame, fps, totalFrames, resolve } }) => {
  const events = t.events ?? [];
  const DOT = 7, LINE_X = 210;
  const headingH = t.heading ? 72 : 0;
  const safeH = 1080 - sg.layout.safeMarginPx * 2;
  const spacing = Math.max(80, Math.min(130, Math.floor((safeH - headingH - 24) / Math.max(1, events.length))));
  const contentH = headingH + (events.length - 1) * spacing + 24;
  const originY = Math.max(sg.layout.safeMarginPx, (1080 - contentH) / 2);
  const timelineY = originY + headingH;
  const lineX = sg.layout.safeMarginPx + LINE_X;
  const lineEnd = totalFrames * 0.78;
  const lineH = interpolate(frame, [8, lineEnd], [0, (events.length - 1) * spacing], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <div style={{ position: "absolute", left: lineX - 1, top: timelineY + DOT, width: 2, height: Math.max(0, lineH - DOT), background: `linear-gradient(to bottom, ${sg.color.primary}cc, ${sg.color.surface}44)` }} />
      {events.map((e, i) => {
        const dotY = timelineY + i * spacing;
        const enterF = (i / Math.max(events.length - 1, 1)) * lineEnd * 0.88;
        const at = e.atMs !== undefined ? msToFrames(e.atMs, fps) : enterF;
        const s = springFrom(frame, fps, at, { damping: 18, stiffness: 88 });
        const dotS = springFrom(frame, fps, at, { damping: 26, stiffness: 150 });
        const color = resolve(e.color);
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: sg.layout.safeMarginPx, top: dotY - 4, width: LINE_X - DOT - 16, textAlign: "right", fontFamily: spaceMonoFontFamily, fontSize: 14, fontWeight: 700, color, letterSpacing: 1.5, opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-8, 0])}px)` }}>{e.date}</div>
            <div style={{ position: "absolute", left: lineX - DOT, top: dotY, width: DOT * 2, height: DOT * 2, borderRadius: "50%", background: color, boxShadow: `0 0 14px ${color}99`, transform: `scale(${dotS})`, zIndex: 2 }} />
            <div style={{ position: "absolute", left: lineX + DOT + 22, top: dotY - 9, maxWidth: 1920 - lineX - DOT - 22 - sg.layout.safeMarginPx, opacity: s, transform: `translateX(${interpolate(s, [0, 1], [28, 0])}px)` }}>
              <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 700, color: sg.color.text, letterSpacing: sg.typography.tracking.h4, lineHeight: 1.1 }}>{e.title}</div>
              {e.description && <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.caption, color: sg.color.textMuted, marginTop: 4, lineHeight: 1.4 }}>{e.description}</div>}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ─── horizontal (year axis + sweeping playhead) ─────────────────────────────────

const Horizontal: React.FC<{ t: TimelineSpec; ctx: Ctx }> = ({ t, ctx: { sg, frame, fps, totalFrames, resolve } }) => {
  const events = (t.events ?? []).map((e) => ({ ...e, year: parseYear(e.date) })).filter((e) => !isNaN(e.year)).sort((a, b) => a.year - b.year);
  if (events.length < 2) return <Vertical t={t} ctx={{ sg, frame, fps, totalFrames, resolve }} />;
  const minY = events[0].year, maxY = events[events.length - 1].year;
  const pad = Math.max(0.5, (maxY - minY) * 0.06);
  const start = minY - pad, end = maxY + pad;
  const x0 = sg.layout.safeMarginPx + 40, x1 = 1920 - sg.layout.safeMarginPx - 40, axisY = 600;
  const X = (y: number) => x0 + ((y - start) / (end - start)) * (x1 - x0);
  const startF = msToFrames(600, fps), endF = totalFrames * 0.85;
  const headX = x0 + interpolate(frame, [startF, endF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (x1 - x0);
  const ticks: number[] = [];
  const span = end - start;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1;
  for (let y = Math.ceil(start / step) * step; y <= end; y += step) ticks.push(y);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
      <line x1={x0} y1={axisY} x2={x1} y2={axisY} stroke={sg.color.surface} strokeWidth={3} />
      <line x1={x0} y1={axisY} x2={headX} y2={axisY} stroke={sg.color.primary} strokeWidth={3} />
      {ticks.map((y, i) => <text key={i} x={X(y)} y={axisY + 36} fill={sg.color.textMuted} fontSize={14} fontFamily={spaceMonoFontFamily} textAnchor="middle">{y}</text>)}
      <line x1={headX} y1={axisY - 230} x2={headX} y2={axisY + 12} stroke={sg.color.primary} strokeWidth={1} opacity={0.35} />
      <circle cx={headX} cy={axisY} r={6} fill={sg.color.primary} />
      {events.map((e, i) => {
        const ex = X(e.year);
        const reachF = startF + ((e.year - start) / (end - start)) * (endF - startF);
        const s = Math.min(1, Math.max(0, springFrom(frame, fps, reachF, { damping: 20, stiffness: 100 })));
        if (s < 0.001) return null;
        const color = resolve(e.color);
        const above = i % 2 === 0;
        const ly = above ? axisY - 30 : axisY + 56;
        return (
          <g key={i} opacity={s}>
            <circle cx={ex} cy={axisY} r={7} fill={color} />
            <line x1={ex} y1={axisY} x2={ex} y2={above ? ly + 8 : ly - 30} stroke={color} strokeWidth={1.5} opacity={0.5} />
            <text x={ex} y={ly} fill={sg.color.text} fontSize={22} fontFamily={syneFontFamily} fontWeight={700} textAnchor="middle">{e.title}</text>
            <text x={ex} y={above ? ly - 26 : ly + 24} fill={color} fontSize={13} fontFamily={spaceMonoFontFamily} fontWeight={700} textAnchor="middle">{e.date}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── eras (period bands) ────────────────────────────────────────────────────────

const Eras: React.FC<{ t: TimelineSpec; ctx: Ctx }> = ({ t, ctx: { sg, frame, fps, resolve } }) => {
  const eras = (t.eras ?? []).map((e) => ({ ...e, y0: parseYear(e.from), y1: parseYear(e.to) })).filter((e) => !isNaN(e.y0) && !isNaN(e.y1));
  if (!eras.length) return null;
  const start = Math.min(...eras.map((e) => e.y0)), end = Math.max(...eras.map((e) => e.y1));
  const x0 = sg.layout.safeMarginPx, x1 = 1920 - sg.layout.safeMarginPx, barY = 470, barH = 130;
  const X = (y: number) => x0 + ((y - start) / (end - start || 1)) * (x1 - x0);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {eras.map((e, i) => {
        const left = X(e.y0), w = X(e.y1) - X(e.y0);
        const s = springFrom(frame, fps, 10 + i * 10, { damping: 22, stiffness: 90 });
        const color = resolve(e.color ?? (i % 2 === 0 ? "primary" : "accent"));
        return (
          <div key={i} style={{ position: "absolute", left, top: barY, width: interpolate(s, [0, 1], [0, w]), height: barH, background: `${color}cc`, borderRight: `2px solid ${sg.color.bg}`, overflow: "hidden", opacity: s }}>
            <div style={{ position: "absolute", left: 16, top: 14, fontFamily: spaceMonoFontFamily, fontSize: 13, color: sg.color.bg, fontWeight: 700, letterSpacing: 1 }}>{e.from}–{e.to}</div>
            <div style={{ position: "absolute", left: 16, bottom: 14, fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, color: sg.color.bg, fontWeight: 800, lineHeight: 1, maxWidth: Math.max(60, w - 32) }}>{e.label}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: x0, top: barY + barH + 14, right: x0, display: "flex", justifyContent: "space-between", fontFamily: spaceMonoFontFamily, fontSize: 14, color: sg.color.textMuted }}>
        <span>{Math.round(start)}</span><span>{Math.round(end)}</span>
      </div>
    </div>
  );
};

// ─── milestones (full-screen dramatic reveals, one at a time) ────────────────────

const Milestones: React.FC<{ t: TimelineSpec; ctx: Ctx }> = ({ t, ctx: { sg, frame, totalFrames, resolve } }) => {
  const events = t.events ?? [];
  if (!events.length) return null;
  const slice = totalFrames / events.length;
  const active = Math.min(events.length - 1, Math.floor(frame / slice));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {events.map((e, i) => {
        const startF = i * slice;
        const inF = frame - startF;
        const vis = interpolate(inF, [0, 12, slice - 12, slice], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (vis < 0.001) return null;
        const color = resolve(e.color);
        return (
          <div key={i} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: sg.layout.safeMarginPx + 40, opacity: vis, transform: `translateY(${interpolate(vis, [0, 1], [30, 0])}px)` }}>
            <div style={{ fontFamily: syneFontFamily, fontSize: 200, fontWeight: 800, color, letterSpacing: -6, lineHeight: 1 }}>{e.date}</div>
            <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, color: sg.color.text, marginTop: 8, maxWidth: 1300 }}>{e.title}</div>
            {e.description && <div style={{ fontFamily: dmSansFontFamily, fontSize: sg.typography.scale.h4, color: sg.color.textMuted, marginTop: 18, maxWidth: 1100, lineHeight: 1.4 }}>{e.description}</div>}
          </div>
        );
      })}
      <div style={{ position: "absolute", bottom: sg.layout.safeMarginPx, left: sg.layout.safeMarginPx + 40, display: "flex", gap: 12 }}>
        {events.map((_, i) => <div key={i} style={{ width: 36, height: 4, background: i <= active ? sg.color.primary : sg.color.surface }} />)}
      </div>
    </div>
  );
};

// ─── parallel (two tracks, shared axis) ─────────────────────────────────────────

const Parallel: React.FC<{ t: TimelineSpec; ctx: Ctx }> = ({ t, ctx: { sg, frame, fps, totalFrames, resolve } }) => {
  const tracks = (t.tracks ?? []).slice(0, 2);
  if (tracks.length < 2) return null;
  const all = tracks.flatMap((tr) => tr.events.map((e) => parseYear(e.date))).filter((y) => !isNaN(y));
  if (!all.length) return null;
  const start = Math.min(...all), end = Math.max(...all);
  const x0 = sg.layout.safeMarginPx + 220, x1 = 1920 - sg.layout.safeMarginPx - 40;
  const X = (y: number) => x0 + ((y - start) / (end - start || 1)) * (x1 - x0);
  const rowY = [410, 700];
  const startF = msToFrames(600, fps), endF = totalFrames * 0.85;
  const headX = x0 + interpolate(frame, [startF, endF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (x1 - x0);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
      {tracks.map((tr, ti) => {
        const color = resolve(tr.color ?? (ti === 0 ? "accent" : "primary"));
        const y = rowY[ti];
        return (
          <g key={ti}>
            <text x={sg.layout.safeMarginPx} y={y + 6} fill={color} fontSize={24} fontFamily={syneFontFamily} fontWeight={800}>{tr.label}</text>
            <line x1={x0} y1={y} x2={x1} y2={y} stroke={sg.color.surface} strokeWidth={2} />
            <line x1={x0} y1={y} x2={headX} y2={y} stroke={color} strokeWidth={2} opacity={0.6} />
            {tr.events.map((e, i) => {
              const yr = parseYear(e.date); if (isNaN(yr)) return null;
              const ex = X(yr);
              const s = headX >= ex - 2 ? 1 : 0;
              return (
                <g key={i} opacity={s}>
                  <circle cx={ex} cy={y} r={7} fill={color} />
                  <text x={ex} y={y - 18} fill={sg.color.text} fontSize={17} fontFamily={syneFontFamily} fontWeight={700} textAnchor="middle">{e.title}</text>
                  <text x={ex} y={y + 30} fill={color} fontSize={12} fontFamily={spaceMonoFontFamily} textAnchor="middle">{e.date}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      <line x1={headX} y1={360} x2={headX} y2={760} stroke={sg.color.primary} strokeWidth={1} opacity={0.3} />
    </svg>
  );
};

/** Builds a TimelineSpec from a scene's `style` — new `style.timeline`, or legacy {heading, events}. */
export function styleToTimelineSpec(style: Record<string, any>): TimelineSpec {
  if (style.timeline && typeof style.timeline === "object") return style.timeline as TimelineSpec;
  return { mode: "vertical", heading: style.heading, events: style.events ?? [] };
}
