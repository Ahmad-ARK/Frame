import React, { useMemo } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { geoMercator, geoPath, GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { useStyleGuide } from "../../StyleGuideContext";
import { msToFrames, springFrom } from "../../utils/animation";

const { fontFamily: syneFontFamily } = loadSyne();
const { fontFamily: spaceMonoFontFamily } = loadSpaceMono();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const worldData = require("world-atlas/countries-110m.json");

// Aliases used by older storyboards; any other value is parsed as a raw ISO
// numeric code, so enrichment can target any country.
const COUNTRY_ISO_ALIAS: Record<string, number> = {
  "004": 4, "398": 398, "860": 860, "762": 762, "795": 795,
  "586": 586, "356": 356, "364": 364, "156": 156, "643": 643,
};
const isoToId = (iso: string): number =>
  COUNTRY_ISO_ALIAS[iso] ?? Number(iso);

// ─── Resolved MapSpec (what this component renders; built by enrich/Root) ──────

export type Vec2 = [number, number]; // [lon, lat]
export type MapMode = "locator" | "tour" | "route" | "compare" | "flows" | "spread";

export type CamKeyframe = { atMs: number; center: Vec2; scale: number };
export type MapHighlight = { iso: string; name?: string; color?: string; opacity?: number; atMs?: number };
export type MapMarker = { position: Vec2; label?: string; sublabel?: string; atMs?: number; color?: string };
export type MapRoute = { points: Vec2[]; atMs?: number; durationMs?: number; color?: string; label?: string };
export type MapFlow = { from: Vec2; to: Vec2; atMs?: number; color?: string; label?: string; curve?: number };
export type MapStep = { iso: string; atMs: number; color?: string; dateLabel?: string };

export type MapSpec = {
  mode: MapMode;
  camera?: { keyframes: CamKeyframe[] };
  center?: Vec2;
  scale?: number;
  highlights?: MapHighlight[];
  markers?: MapMarker[];
  route?: MapRoute;
  flows?: MapFlow[];
  steps?: MapStep[];
  sideLabels?: { text: string; color?: string }[]; // compare lower-thirds
};

export type MapSceneProps = { durationMs: number; map: MapSpec };

// ─── Camera ───────────────────────────────────────────────────────────────────

function applyCubicBezier([x1, , x2]: [number, number, number, number], t: number): number {
  // x1/x2 only used to solve u; y handled by caller-supplied easing. We keep a
  // robust fixed-iteration solver (never falls back to linear t → no jitter).
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = (u: number) => 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 30; i++) { u = (lo + hi) / 2; if (cx(u) < t) lo = u; else hi = u; }
  return u;
}
// ease-out cubic-bezier [0.16,1,0.3,1] for camera moves
function easeCamera(t: number): number {
  const u = applyCubicBezier([0.16, 1, 0.3, 1], t);
  const y1 = 1, y2 = 1;
  return 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
}

function cameraAtMs(ms: number, kfs: CamKeyframe[] | undefined, fallback: { center: Vec2; scale: number }): { center: Vec2; scale: number } {
  if (!kfs || kfs.length === 0) return fallback;
  if (ms <= kfs[0].atMs) return { center: kfs[0].center, scale: kfs[0].scale };
  const last = kfs[kfs.length - 1];
  if (ms >= last.atMs) return { center: last.center, scale: last.scale };
  let i = 0;
  while (i < kfs.length - 1 && ms > kfs[i + 1].atMs) i++;
  const from = kfs[i], to = kfs[i + 1];
  const t = easeCamera((ms - from.atMs) / (to.atMs - from.atMs));
  return {
    center: [from.center[0] + (to.center[0] - from.center[0]) * t, from.center[1] + (to.center[1] - from.center[1]) * t],
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────────

export const MapScene: React.FC<MapSceneProps> = ({ durationMs, map }) => {
  const sg = useStyleGuide();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const totalFrames = msToFrames(durationMs, fps);
  const elev = sg.motion.signatures.labelElevation!;
  const currentMs = (frame / fps) * 1000;

  const countryFeatures = useMemo(() => {
    const topo = worldData as any;
    return (feature(topo, topo.objects.countries) as any).features as any[];
  }, []);

  // ── Camera + continuous ambient drift (never frozen) ──
  const fallback = { center: map.center ?? [20, 30] as Vec2, scale: map.scale ?? 600 };
  const cam = cameraAtMs(currentMs, map.camera?.keyframes, fallback);
  const driftT = totalFrames > 0 ? frame / totalFrames : 0;
  const driftScale = cam.scale * (1 + 0.15 * driftT);
  const driftCenter: Vec2 = [cam.center[0] + 0.5 * Math.sin(driftT * Math.PI), cam.center[1]];

  const projection = geoMercator().center(driftCenter).scale(driftScale).translate([width / 2, height / 2]);
  const pathGen = geoPath().projection(projection);
  const proj = (p: Vec2): [number, number] => (projection(p) ?? [0, 0]) as [number, number];

  const resolveColor = (token?: string): string => {
    if (!token) return sg.color.map!.land;
    if (token === "primary") return sg.color.primary;
    if (token === "accent") return sg.color.accent;
    if (token === "surface") return sg.color.surface;
    if (token === "text") return sg.color.text;
    return token;
  };

  // ── Timed country highlights (mode-agnostic; spread uses `steps`) ──
  const highlightById = useMemo(() => {
    const m: Record<number, MapHighlight> = {};
    for (const h of map.highlights ?? []) {
      const id = isoToId(h.iso);
      if (Number.isFinite(id)) m[id] = h;
    }
    for (const s of map.steps ?? []) {
      const id = isoToId(s.iso);
      if (Number.isFinite(id)) m[id] = { iso: s.iso, color: s.color, opacity: 0.7, atMs: s.atMs };
    }
    return m;
  }, [map.highlights, map.steps]);

  const mapEnter = spring({ frame, fps, config: { damping: 26, stiffness: 70 } });
  const exitOpacity = interpolate(frame, [totalFrames - msToFrames(sg.motion.durationsMs.exit, fps), totalFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Markers (+ route waypoints) carry the elevated text labels.
  // Sort by entry time so a later-appearing label paints ON TOP of earlier ones
  // (coplanar elevated labels stack by DOM order).
  const labelItems: MapMarker[] = (map.markers ?? [])
    .filter((m) => m.label)
    .slice()
    .sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));

  // Route progress
  const route = map.route;
  const routeStartF = route ? msToFrames(route.atMs ?? 0, fps) : 0;
  const routeEndF = route ? routeStartF + msToFrames(route.durationMs ?? 4000, fps) : 0;
  const routeProgress = route
    ? interpolate(frame, [routeStartF, routeEndF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const projectedRoute = useMemo(
    () => (route?.points ?? []).map((p) => proj(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, driftCenter[0], driftCenter[1], driftScale]
  );

  // The most recently-activated spread step → date ticker.
  const activeDate = (() => {
    if (map.mode !== "spread" || !map.steps?.length) return undefined;
    const active = map.steps.filter((s) => currentMs >= s.atMs).sort((a, b) => b.atMs - a.atMs)[0];
    return active?.dateLabel;
  })();

  return (
    <AbsoluteFill style={{ background: sg.color.bg, overflow: "hidden" }}>
      <div style={{ width: "100%", height: "100%", perspective: `${elev.perspectivePx}px`, perspectiveOrigin: "50% 32%", opacity: mapEnter * exitOpacity }}>
        <div style={{
          width: "100%", height: "100%",
          transform: elev.enabled ? `rotateX(${elev.planeRotateXDeg}deg)` : "none",
          transformOrigin: "50% 58%", transformStyle: "preserve-3d", position: "relative",
        }}>
          <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
            <defs>
              <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Countries + timed highlights */}
            {countryFeatures.map((feat: any, i: number) => {
              const d = pathGen(feat as GeoPermissibleObjects);
              if (!d) return null;
              // world-atlas feature ids are strings ("004"); normalize to number.
              const hl = highlightById[Number(feat.id)];
              const fillIn = hl?.atMs !== undefined
                ? interpolate(currentMs, [hl.atMs, hl.atMs + 600], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                : 1;
              const fill = hl ? resolveColor(hl.color) : sg.color.map!.land;
              const fillOpacity = hl ? (hl.opacity ?? 0.8) * fillIn : 0.7;
              const isPrimary = hl?.color === "primary";
              return (
                <path key={i} d={d} fill={fill} fillOpacity={fillOpacity}
                  stroke={sg.color.map!.border} strokeWidth={isPrimary ? 1.5 : 0.6}
                  filter={isPrimary ? "url(#glow)" : undefined} />
              );
            })}

            {/* Flows: curved animated arrows (source → target) */}
            {(map.flows ?? []).map((f, i) => (
              <FlowArrow key={`flow-${i}`} flow={f} proj={proj} frame={frame} fps={fps} color={resolveColor(f.color ?? "accent")} />
            ))}

            {/* Route: animated drawing line + moving head */}
            {route && routeProgress > 0 && projectedRoute.length >= 2 && (
              <RouteLine pts={projectedRoute} progress={routeProgress} color={resolveColor(route.color ?? "primary")} />
            )}

            {/* Marker pins (flat on the plane) */}
            {(map.markers ?? []).map((m, i) => (
              <MarkerPin key={`pin-${i}`} m={m} proj={proj} frame={frame} fps={fps} color={resolveColor(m.color ?? "primary")} bg={sg.color.bg} />
            ))}
          </svg>

          {/* Elevated standing labels (markers with text) */}
          {labelItems.map((m, i) => (
            <ElevatedLabel key={`lbl-${i}`} m={m} proj={proj} frame={frame} fps={fps} elev={elev} sg={sg} />
          ))}
        </div>
      </div>

      {/* Cinematic vignette + scanline */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 45%, rgba(11,11,15,0.85) 100%)", pointerEvents: "none", zIndex: 5 }} />
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)", pointerEvents: "none", zIndex: 6, opacity: 0.6 }} />

      {/* ── Mode-specific overlays ── */}
      {(() => {
        switch (map.mode) {
          case "compare":
            return <CompareLabels sides={map.sideLabels ?? []} frame={frame} fps={fps} sg={sg} resolveColor={resolveColor} exitOpacity={exitOpacity} />;
          case "spread":
            return activeDate ? <DateTicker date={activeDate} sg={sg} exitOpacity={exitOpacity} /> : null;
          case "route":
            return route?.label && routeProgress > 0.6
              ? <RouteLabel label={route.label} opacity={interpolate(routeProgress, [0.6, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * exitOpacity} sg={sg} />
              : null;
          default:
            return null;
        }
      })()}
    </AbsoluteFill>
  );
};

// ─── Primitives ─────────────────────────────────────────────────────────────────

const MarkerPin: React.FC<{ m: MapMarker; proj: (p: Vec2) => [number, number]; frame: number; fps: number; color: string; bg: string }> = ({ m, proj, frame, fps, color, bg }) => {
  const [x, y] = proj(m.position);
  const enterF = msToFrames(m.atMs ?? 0, fps);
  const enter = springFrom(frame, fps, enterF, { damping: 24, stiffness: 120 });
  if (enter < 0.001) return null;
  const loop = fps * 1.6;
  const t = ((frame - enterF) % loop) / loop;
  return (
    <g opacity={enter}>
      <circle cx={x} cy={y} r={7 + t * 22} fill="none" stroke={color} strokeWidth={2} opacity={(1 - t) * 0.5 * enter} />
      <circle cx={x} cy={y} r={9} fill={color} opacity={0.22} />
      <circle cx={x} cy={y} r={4.5} fill={color} opacity={0.98} />
      <circle cx={x} cy={y} r={4.5} fill="none" stroke={bg} strokeWidth={1.2} opacity={0.6} />
    </g>
  );
};

const RouteLine: React.FC<{ pts: [number, number][]; progress: number; color: string }> = ({ pts, progress, color }) => {
  const n = pts.length - 1;
  const segs: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    if (progress <= a) break;
    const sp = Math.min(1, (progress - a) / (b - a));
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const mx = x1 + (x2 - x1) * sp, my = y1 + (y2 - y1) * sp;
    segs.push(<g key={i}>
      <line x1={x1} y1={y1} x2={mx} y2={my} stroke={color} strokeWidth={8} strokeLinecap="round" opacity={0.2} />
      <line x1={x1} y1={y1} x2={mx} y2={my} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
    </g>);
  }
  const gi = progress * n, si = Math.min(Math.floor(gi), n - 1), sp = gi - si;
  const [hx1, hy1] = pts[si], [hx2, hy2] = pts[si + 1] ?? pts[si];
  const hx = hx1 + (hx2 - hx1) * sp, hy = hy1 + (hy2 - hy1) * sp;
  return (<g>{segs}<circle cx={hx} cy={hy} r={10} fill={color} opacity={0.25} /><circle cx={hx} cy={hy} r={5} fill={color} opacity={0.95} /></g>);
};

const FlowArrow: React.FC<{ flow: MapFlow; proj: (p: Vec2) => [number, number]; frame: number; fps: number; color: string }> = ({ flow, proj, frame, fps, color }) => {
  const [x0, y0] = proj(flow.from);
  const [x2, y2] = proj(flow.to);
  const enterF = msToFrames(flow.atMs ?? 0, fps);
  const draw = springFrom(frame, fps, enterF, { damping: 30, stiffness: 60 });
  if (draw < 0.001) return null;
  // Control point: perpendicular offset from the midpoint → a gentle arc.
  const mx = (x0 + x2) / 2, my = (y0 + y2) / 2;
  const dx = x2 - x0, dy = y2 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (flow.curve ?? 0.22) * len;
  const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
  // Sample the quadratic bezier up to `draw`.
  const N = 40, upto = Math.max(1, Math.round(N * draw));
  const pt = (t: number): [number, number] => [
    (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x2,
    (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y2,
  ];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i <= upto; i++) { const [px, py] = pt(i / N); d += ` L ${px} ${py}`; }
  const [hx, hy] = pt(upto / N);
  const [bx, by] = pt(Math.max(0, upto - 1) / N);
  const ang = Math.atan2(hy - by, hx - bx);
  const ah = 12;
  return (
    <g opacity={draw}>
      <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.95} filter="url(#glow)" />
      <circle cx={x0} cy={y0} r={4} fill={color} />
      {draw > 0.98 && (
        <path d={`M ${hx} ${hy} L ${hx - ah * Math.cos(ang - 0.4)} ${hy - ah * Math.sin(ang - 0.4)} L ${hx - ah * Math.cos(ang + 0.4)} ${hy - ah * Math.sin(ang + 0.4)} Z`} fill={color} />
      )}
    </g>
  );
};

const ElevatedLabel: React.FC<{ m: MapMarker; proj: (p: Vec2) => [number, number]; frame: number; fps: number; elev: any; sg: any }> = ({ m, proj, frame, fps, elev, sg }) => {
  const enterF = msToFrames(m.atMs ?? 0, fps);
  const s = springFrom(frame, fps, enterF, { damping: 28, stiffness: 95 });
  const [x, y] = proj(m.position);
  const counter = elev.enabled ? ` rotateX(-${elev.planeRotateXDeg}deg) translateZ(${elev.translateZ}px)` : "";
  return (
    <div style={{ position: "absolute", left: x, top: y, transformStyle: "preserve-3d", transform: `translateX(-50%) translateY(-50%)${counter}`, pointerEvents: "none" }}>
      {elev.enabled && (
        <div style={{ position: "absolute", left: "50%", bottom: "calc(100% + 4px)", width: 1, height: interpolate(s, [0, 1], [0, 18]), background: `linear-gradient(to top, ${sg.color.primary}, transparent)`, transform: "translateX(-50%)", opacity: s }} />
      )}
      <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [6, 0])}px)` }}>
        <div style={{ background: "rgba(11,11,15,0.88)", border: `1px solid ${sg.color.primary}`, borderRadius: 2, padding: "7px 14px", boxShadow: `0 0 16px rgba(207,52,52,0.25)` }}>
          <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.caption, fontWeight: 800, color: sg.color.text, letterSpacing: sg.typography.tracking.caption, textTransform: "uppercase", whiteSpace: "nowrap" }}>{m.label}</div>
          {m.sublabel && <div style={{ fontFamily: spaceMonoFontFamily, fontSize: 11, color: sg.color.textMuted, letterSpacing: 0.8, marginTop: 3, whiteSpace: "nowrap" }}>{m.sublabel}</div>}
        </div>
      </div>
    </div>
  );
};

const CompareLabels: React.FC<{ sides: { text: string; color?: string }[]; frame: number; fps: number; sg: any; resolveColor: (t?: string) => string; exitOpacity: number }> = ({ sides, frame, fps, sg, resolveColor, exitOpacity }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: sg.layout.safeMarginPx, display: "flex", justifyContent: "space-around", zIndex: 7, opacity: exitOpacity }}>
    {sides.slice(0, 3).map((s, i) => {
      const sp = springFrom(frame, fps, 10 + i * 8, { damping: 22, stiffness: 100 });
      return (
        <div key={i} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [16, 0])}px)`, textAlign: "center" }}>
          <div style={{ width: 48, height: 3, background: resolveColor(s.color), margin: "0 auto 10px" }} />
          <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h4, fontWeight: 800, color: sg.color.text, letterSpacing: sg.typography.tracking.h4 }}>{s.text}</div>
        </div>
      );
    })}
  </div>
);

const DateTicker: React.FC<{ date: string; sg: any; exitOpacity: number }> = ({ date, sg, exitOpacity }) => (
  <div style={{ position: "absolute", top: sg.layout.safeMarginPx, right: sg.layout.safeMarginPx, zIndex: 7, opacity: exitOpacity }}>
    <div style={{ fontFamily: syneFontFamily, fontSize: sg.typography.scale.h2, fontWeight: 800, color: sg.color.accent, letterSpacing: sg.typography.tracking.h2 }}>{date}</div>
  </div>
);

const RouteLabel: React.FC<{ label: string; opacity: number; sg: any }> = ({ label, opacity, sg }) => (
  <div style={{ position: "absolute", left: sg.layout.safeMarginPx, bottom: sg.layout.safeMarginPx, zIndex: 7, opacity }}>
    <div style={{ fontFamily: spaceMonoFontFamily, fontSize: sg.typography.scale.micro, color: sg.color.primary, letterSpacing: sg.typography.tracking.micro, textTransform: "uppercase" }}>{label}</div>
  </div>
);

// ─── Legacy adapter ──────────────────────────────────────────────────────────────
// Builds a MapSpec from older storyboard `style` (cameraAnimation / highlightCountries
// / labels / invasionRoute) OR passes through a new `style.map`.
export function styleToMapSpec(style: Record<string, any>): MapSpec {
  if (style.map && typeof style.map === "object") return style.map as MapSpec;
  return {
    mode: style.invasionRoute ? "route" : "locator",
    camera: style.cameraAnimation,
    center: style.center,
    scale: style.scale,
    highlights: (style.highlightCountries ?? []).map((h: any) => ({ iso: h.iso, name: h.name, color: h.color, opacity: h.opacity })),
    markers: [
      ...(style.markers ?? []),
      ...(style.labels ?? []).map((l: any) => ({ position: l.position, label: l.text, sublabel: l.sublabel, atMs: l.enterAtMs, color: "primary" })),
    ],
    route: style.invasionRoute
      ? { points: style.invasionRoute.waypoints, atMs: style.invasionRoute.enterAtMs, durationMs: style.invasionRoute.animDurationMs, color: style.invasionRoute.color, label: style.invasionRoute.label }
      : undefined,
  };
}
