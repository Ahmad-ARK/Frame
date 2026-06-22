import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { geoOrthographic, geoPath, geoGraticule, geoDistance, geoInterpolate, GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const worldData = require("world-atlas/countries-110m.json");

export type GlobeMode = "locator" | "arcs";
export type Vec2 = [number, number];
export type GlobeArc = { from: Vec2; to: Vec2; atMs?: number; color?: string; label?: string };
export type GlobeMarker = { position: Vec2; label?: string; atMs?: number; color?: string };
export type GlobeSpec = {
  mode: GlobeMode;
  center?: Vec2; // focus point (front of globe)
  highlights?: { iso: string; color?: string; opacity?: number }[];
  arcs?: GlobeArc[];
  markers?: GlobeMarker[];
};

export type GlobeSceneProps = { durationMs: number; globe: GlobeSpec };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const GlobeScene: React.FC<GlobeSceneProps> = ({ durationMs, globe }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalFrames = msToFrames(durationMs, fps);
  const currentMs = (frame / fps) * 1000;

  const countries = useMemo(() => {
    const topo = worldData as any;
    return (feature(topo, topo.objects.countries) as any).features as any[];
  }, []);

  const resolveColor = (c?: string) => (c === "accent" ? sg.color.accent : c === "primary" || !c ? sg.color.primary : c);
  const center = globe.center ?? (globe.arcs?.length ? midpoint(globe.arcs[0].from, globe.arcs[0].to) : [30, 20]);

  // Rotation: spin in from an offset to face `center`, then a slow drift.
  const rp = spring({ frame, fps, config: { damping: 30, stiffness: 40 } });
  const target: [number, number] = [-center[0], -center[1]];
  const startRot: [number, number] = [target[0] - 55, Math.max(-90, Math.min(90, target[1] - 18))];
  const driftT = totalFrames > 0 ? frame / totalFrames : 0;
  const rotate: [number, number] = [lerp(startRot[0], target[0], rp) + 6 * driftT, lerp(startRot[1], target[1], rp)];

  const R = Math.min(width, height) * 0.42;
  const projection = geoOrthographic().scale(R).translate([width / 2, height / 2]).rotate(rotate).clipAngle(90);
  const pathGen = geoPath().projection(projection);
  const frontCenter: Vec2 = [-rotate[0], -rotate[1]];
  const visible = (p: Vec2) => geoDistance(p as [number, number], frontCenter as [number, number]) < Math.PI / 2 - 0.02;
  const proj = (p: Vec2): [number, number] => (projection(p as [number, number]) ?? [0, 0]) as [number, number];

  const highlightById: Record<number, { color?: string; opacity?: number }> = {};
  for (const h of globe.highlights ?? []) highlightById[Number(h.iso)] = { color: h.color, opacity: h.opacity };

  const graticule = useMemo(() => geoGraticule().step([20, 20])(), []);
  const enter = spring({ frame, fps, config: { damping: 26, stiffness: 70 } });
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: enter * exitOpacity }}>
        <svg width={width} height={height}>
          <defs>
            <radialGradient id="globeShade" cx="38%" cy="35%" r="75%">
              <stop offset="0%" stopColor={sg.color.surface} />
              <stop offset="70%" stopColor={sg.color.map?.water ?? "#0b0b0f"} />
              <stop offset="100%" stopColor="#05050a" />
            </radialGradient>
          </defs>
          {/* ocean sphere */}
          <circle cx={width / 2} cy={height / 2} r={R} fill="url(#globeShade)" stroke={`${sg.color.primary}55`} strokeWidth={1.5} />
          {/* graticule */}
          <path d={pathGen(graticule as GeoPermissibleObjects) ?? undefined} fill="none" stroke={sg.color.map?.border ?? "#363a45"} strokeOpacity={0.25} strokeWidth={0.6} />
          {/* land */}
          {countries.map((feat: any, i: number) => {
            const d = pathGen(feat as GeoPermissibleObjects);
            if (!d) return null;
            const hl = highlightById[Number(feat.id)];
            const fill = hl ? resolveColor(hl.color) : sg.color.map!.land;
            return <path key={i} d={d} fill={fill} fillOpacity={hl ? hl.opacity ?? 0.85 : 0.85} stroke={sg.color.map!.border} strokeWidth={0.4} />;
          })}
          {/* arcs (great circles) */}
          {(globe.arcs ?? []).map((arc, i) => <ArcPath key={`arc-${i}`} arc={arc} proj={proj} visible={visible} currentMs={currentMs} color={resolveColor(arc.color ?? "accent")} />)}
          {/* markers + arc endpoints */}
          {[...(globe.markers ?? []), ...(globe.arcs ?? []).flatMap((a) => [{ position: a.from }, { position: a.to }])].map((m, i) => {
            if (!visible(m.position)) return null;
            const [x, y] = proj(m.position);
            return <g key={`m-${i}`}><circle cx={x} cy={y} r={9} fill={sg.color.primary} opacity={0.22} /><circle cx={x} cy={y} r={4.5} fill={sg.color.primary} /></g>;
          })}
        </svg>
        {/* standing labels */}
        {(globe.markers ?? []).filter((m) => m.label && visible(m.position)).map((m, i) => {
          const [x, y] = proj(m.position);
          const s = springFrom(frame, fps, msToFrames(m.atMs ?? 0, fps), { damping: 24, stiffness: 100 });
          return (
            <div key={`l-${i}`} style={{ position: "absolute", left: x, top: y - 14, transform: "translate(-50%,-100%)", opacity: s }}>
              <div style={{ background: "rgba(11,11,15,0.88)", border: `1px solid ${sg.color.primary}`, borderRadius: 2, padding: "5px 10px", fontFamily: syneFontFamily, fontSize: sg.typography.scale.caption, fontWeight: 800, color: sg.color.text, textTransform: "uppercase", whiteSpace: "nowrap" }}>{m.label}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 55%, rgba(11,11,15,0.6) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

const ArcPath: React.FC<{ arc: GlobeArc; proj: (p: Vec2) => [number, number]; visible: (p: Vec2) => boolean; currentMs: number; color: string }> = ({ arc, proj, visible, currentMs, color }) => {
  const start = arc.atMs ?? 0;
  const progress = Math.max(0, Math.min(1, (currentMs - start) / 1400));
  if (progress <= 0) return null;
  const interp = geoInterpolate(arc.from as [number, number], arc.to as [number, number]);
  const N = 48;
  const upto = Math.max(1, Math.round(N * progress));
  let d = "";
  for (let i = 0; i <= upto; i++) {
    const p = interp(i / N) as Vec2;
    if (!visible(p)) { d = ""; continue; } // skip back-of-globe segments
    const [x, y] = proj(p);
    d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d ? <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.95} /> : null;
};

function midpoint(a: Vec2, b: Vec2): Vec2 {
  const m = geoInterpolate(a as [number, number], b as [number, number])(0.5) as Vec2;
  return m;
}

export function styleToGlobeSpec(style: Record<string, any>): GlobeSpec {
  if (style.globe && typeof style.globe === "object") return style.globe as GlobeSpec;
  return { mode: "locator", center: style.center, highlights: style.highlights };
}
