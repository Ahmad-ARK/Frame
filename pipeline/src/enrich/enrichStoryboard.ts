import { resolve } from "node:path";
import { generateJson, isQuotaError } from "../gemini/client.js";
import { stripFences } from "../shared/storyboardIO.js";
import { type Storyboard } from "../schema/storyboard.js";
import { geocodePlace } from "./geocode.js";
import { GeocodeCache } from "./geocodeCache.js";
import { alpha2ToNumeric } from "./iso3166.js";
import {
  ENRICH_SYSTEM_PROMPT,
  buildEnrichUserPrompt,
  type EnrichSceneInput,
} from "./prompt.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EnrichResult = {
  storyboard: Storyboard;
  enriched: number;
  skipped: number;
  quotaHit: boolean;
  notes: string[];
};

const has = (style: any, key: string) =>
  style && style[key] !== undefined && style[key] !== null;

/** First spoken-start time (ms) of a cue word in a scene's word timings, if any. */
function findWordTime(
  wordTimings: { word: string; startMs: number; endMs: number }[] | undefined,
  cue: string
): number | undefined {
  if (!wordTimings?.length) return undefined;
  const c = cue.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!c) return undefined;
  const hit = wordTimings.find((w) => w.word.toLowerCase().replace(/[^a-z0-9]/g, "") === c);
  return hit?.startMs;
}

type Anchor = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "left" | "right" | "center";
const VALID_ANCHORS = new Set<Anchor>(["topLeft", "topRight", "bottomLeft", "bottomRight", "left", "right", "center"]);
// Tried in this order when an overlay's wanted anchor is taken/blocked. Corners
// before edges before center (center sits over the subject of most scenes).
const ANCHOR_PRIORITY: Anchor[] = ["topRight", "topLeft", "right", "left", "bottomRight", "bottomLeft", "center"];
// Vertical/horizontal mirror — first fallback for a blocked anchor, so a remapped
// overlay keeps its side (a bottomLeft caption that collides moves to topLeft).
const MIRROR: Record<Anchor, Anchor> = {
  topLeft: "bottomLeft", bottomLeft: "topLeft", topRight: "bottomRight", bottomRight: "topRight",
  left: "right", right: "left", center: "center",
};

/**
 * The anchor zones a scene's OWN fixed UI occupies — timed overlays must avoid
 * landing on them (this is what made a video's lower-third caption and a timeline's
 * heading get covered by a floating overlay).
 */
function sceneOccupiedAnchors(type: string): Set<Anchor> {
  switch (type) {
    case "video":
    case "archivalPhoto":
    case "genImage":
    case "newspaper":
    case "document":
      return new Set<Anchor>(["bottomLeft", "bottomRight"]); // lower-third caption + attribution/source
    case "timeline":
      return new Set<Anchor>(["topLeft"]); // heading kicker
    case "quoteCard":
    case "titleCard":
    case "comparison":
      return new Set<Anchor>(["center", "left", "right"]); // centred / side text
    case "stat":
    case "chart":
      return new Set<Anchor>(["center"]); // the big number / chart
    default:
      return new Set<Anchor>(); // map: tags are placed dynamically — rely on overlap avoidance only
  }
}

/**
 * Assigns each overlay an anchor that (a) avoids the scene's occupied label zones
 * and (b) does not share an anchor with a time-overlapping sibling. Greedy in time
 * order; prefers the requested anchor, then its mirror, then the priority list.
 */
export function assignOverlayAnchors(
  specs: { atMs: number; durationMs: number; anchor?: string }[],
  sceneType: string
): Anchor[] {
  const blocked = sceneOccupiedAnchors(sceneType);
  const placed: { anchor: Anchor; start: number; end: number }[] = [];
  const order = specs.map((s, i) => ({ i, start: s.atMs, end: s.atMs + s.durationMs, want: VALID_ANCHORS.has(s.anchor as Anchor) ? (s.anchor as Anchor) : undefined }));
  order.sort((a, b) => a.start - b.start);
  const out: Anchor[] = new Array(specs.length);
  const taken = (a: Anchor, start: number, end: number) => placed.some((p) => p.anchor === a && start < p.end && end > p.start);
  for (const o of order) {
    const tryOrder: Anchor[] = [];
    const push = (a?: Anchor) => { if (a && !tryOrder.includes(a)) tryOrder.push(a); };
    push(o.want); push(o.want ? MIRROR[o.want] : undefined);
    for (const a of ANCHOR_PRIORITY) push(a);
    const anchor =
      tryOrder.find((a) => !blocked.has(a) && !taken(a, o.start, o.end)) ?? // free & unblocked
      tryOrder.find((a) => !taken(a, o.start, o.end)) ?? // free (allow blocked if all clear ones taken)
      tryOrder.find((a) => !blocked.has(a)) ?? // unblocked (accept time overlap)
      o.want ?? ANCHOR_PRIORITY[0];
    placed.push({ anchor, start: o.start, end: o.end });
    out[o.i] = anchor;
  }
  return out;
}

// An IMAGE overlay only earns its place when the base scene can't itself show that
// imagery AND an inset doesn't undermine the scene's job. Suppress it where the base
// is FULL imagery (video, archival/gen photos), a text PUNCH (quote/title — and
// quote-portrait already shows the face), or where event callouts replace it
// (timeline). KEEP it where an inset of a named person/place/event adds something
// the base can't show: map, stat/chart, comparison, and the paper/print scenes
// (document → the memo's author; newspaper → the event photo), plus globe.
const IMAGE_OVERLAY_SUPPRESSED = new Set([
  "video", "archivalPhoto", "genImage", "quoteCard", "titleCard", "timeline",
]);
export const suppressesImageOverlays = (type: string): boolean => IMAGE_OVERLAY_SUPPRESSED.has(type);

/** Resolves LLM overlay specs into render-ready timed overlays (cueWord → atMs). */
function resolveOverlays(e: any, scene: any): any[] {
  const raw = Array.isArray(e?.overlays) ? e.overlays : [];
  if (!raw.length) return [];
  const dur = scene.durationMs ?? 5000;
  const wt = scene.wordTimings;
  const type = scene.visual?.type;
  // Drop image overlays where they're redundant/undermining (text & stat still allowed).
  const dropImages = suppressesImageOverlays(type);
  // 1) Resolve timing + payload (anchor assigned in pass 2, collision-aware).
  const items = raw
    .slice(0, 5)
    .map((o: any, i: number) => {
      const t = o.cueWord ? findWordTime(wt, String(o.cueWord)) : undefined;
      const atMs = t !== undefined ? t : Math.round(dur * (0.2 + 0.6 * (i / Math.max(1, raw.length - 1))));
      const durationMs = o.durationMs ?? 3500;
      const want = VALID_ANCHORS.has(o.anchor) ? o.anchor : undefined;
      let payload: any = null;
      if (o.kind === "image" && o.subject) payload = dropImages ? null : { kind: "image", subject: String(o.subject), caption: o.caption };
      else if (o.kind === "stat" && o.value) payload = { kind: "stat", value: String(o.value), label: o.label };
      else if (o.kind === "text" && o.text) payload = { kind: "text", text: String(o.text), emphasis: true };
      return payload ? { atMs, durationMs, anchor: want, payload } : null;
    })
    .filter(Boolean) as { atMs: number; durationMs: number; anchor?: Anchor; payload: any }[];
  // 2) Collision-aware anchor assignment (avoids scene labels + overlapping siblings).
  const anchors = assignOverlayAnchors(items, type);
  return items.map((it, i) => ({ atMs: it.atMs, durationMs: it.durationMs, anchor: anchors[i], ...it.payload }));
}

/**
 * Information-dense base visuals (a montage wall of headlines, an evidence grid of
 * photos) already carry the beat themselves — laying timed overlays on top just
 * collides with the base and reads as clutter. Suppress overlays for those modes.
 */
function hasBusyBase(type: string, e: any): boolean {
  if (type === "newspaper") return e?.newspaper?.mode === "montage";
  if (type === "archivalPhoto" || type === "genImage") {
    const m = e?.photo?.mode;
    return m === "grid" || m === "montage";
  }
  return false;
}

/** Scenes whose heavy style is missing and which this stage can fill. */
function needsEnrichment(type: string, style: any): boolean {
  if (type === "map") return !has(style, "map") && !has(style, "center");
  if (type === "stat" || type === "chart") return !has(style, "data") && !has(style, "numericValue");
  if (type === "comparison") return !has(style, "left") && !has(style, "right");
  if (type === "timeline") return !has(style, "timeline");
  // quoteCard: upgrade unless style.quote is already a mode-based object.
  if (type === "quoteCard") return typeof style?.quote !== "object";
  if (type === "titleCard") return !has(style, "titleCard");
  if (type === "archivalPhoto" || type === "genImage") return !has(style, "photo");
  if (type === "newspaper") return !has(style, "newspaper");
  if (type === "document") return !has(style, "document");
  if (type === "globe") return !has(style, "globe");
  if (type === "video") return !has(style, "video");
  return false;
}

/**
 * Fills heavy per-scene style (map camera + highlights, stat figures,
 * comparison panels). Hybrid: one LLM call supplies judgement; map coordinates
 * are then resolved deterministically via geocoding (never hallucinated).
 * Idempotent — scenes that already have the style are left untouched.
 */
export async function enrichStoryboard(
  input: Storyboard,
  opts: { geocodeDelayMs?: number; llmEnrichMap?: Record<string, any> } = {}
): Promise<EnrichResult> {
  const sb: Storyboard = structuredClone(input);
  const notes: string[] = [];
  const geocodeDelayMs = opts.geocodeDelayMs ?? 1100; // Nominatim ~1 req/s

  // Every scene is a candidate: map/stat/comparison may need heavy style, and
  // ALL scene types can receive timed overlays. Skip a scene only if it already
  // has both whatever heavy style it needs and overlays.
  const targets = sb.scenes.filter(
    (s) => needsEnrichment(s.visual.type, s.visual.style) || !s.visual.overlays
  );
  if (targets.length === 0) {
    return { storyboard: sb, enriched: 0, skipped: 0, quotaHit: false, notes: ["nothing to enrich"] };
  }

  const sceneInputs: EnrichSceneInput[] = targets.map((s) => ({
    id: s.id,
    type: s.visual.type,
    narration: s.narration,
    directive: s.visual.directive,
  }));

  // ── One LLM call for all judgement parts (or injected JSON for testing) ──
  let enrichMap: Record<string, any>;
  if (opts.llmEnrichMap) {
    enrichMap = opts.llmEnrichMap.scenes ?? opts.llmEnrichMap;
    notes.push("using injected LLM JSON (--llm-json)");
  } else {
    try {
      const raw = await generateJson({
        system: ENRICH_SYSTEM_PROMPT,
        user: buildEnrichUserPrompt(sb.topic, sceneInputs),
        temperature: 0.2,
      });
      enrichMap = JSON.parse(stripFences(raw))?.scenes ?? {};
    } catch (err) {
      if (isQuotaError(err)) {
        return { storyboard: sb, enriched: 0, skipped: targets.length, quotaHit: true, notes };
      }
      throw err;
    }
  }

  let enriched = 0;

  // Shared, rate-limited geocoder (Nominatim ~1 req/s) with an in-process miss
  // cache and a PERSISTENT disk cache of hits. The disk cache means a place
  // resolved on any prior run never hits the network again — respecting
  // Nominatim's usage policy and surviving transient throttling/blocks.
  const diskCache = new GeocodeCache(resolve(process.cwd(), ".cache", "geocode.json"));
  const missCache = new Set<string>(); // null results within this run only (retry next run)
  let geoCalls = 0;
  const geocode = async (place?: string) => {
    if (!place) return null;
    const hit = diskCache.get(place);
    if (hit) return hit;
    if (missCache.has(place.trim().toLowerCase())) return null;
    if (geoCalls > 0) await sleep(geocodeDelayMs);
    geoCalls++;
    let r = null as Awaited<ReturnType<typeof geocodePlace>>;
    try { r = await geocodePlace(place); } catch { r = null; }
    if (r) { diskCache.set(place, r); diskCache.flush(); }
    else missCache.add(place.trim().toLowerCase());
    return r;
  };

  for (const scene of targets) {
    const e = enrichMap[scene.id];
    if (!e) {
      notes.push(`${scene.id}: no enrichment returned`);
      continue;
    }
    const style: Record<string, any> = { ...(scene.visual.style ?? {}) };
    const needsHeavy = needsEnrichment(scene.visual.type, scene.visual.style);

    // Timed overlays for ANY scene (word-cued image/text/stat insets) — except
    // information-dense base modes (montage/grid) where they would just collide.
    if (!scene.visual.overlays && !hasBusyBase(scene.visual.type, e)) {
      const overlays = resolveOverlays(e, scene);
      if (overlays.length) {
        scene.visual.overlays = overlays as any;
        notes.push(`${scene.id}: ${overlays.length} overlay(s) [${overlays.map((o: any) => o.kind).join(",")}]`);
      }
    }

    if (!needsHeavy) {
      enriched++;
      continue;
    }

    if (scene.visual.type === "map") {
      let map = await resolveMapStyle(e, scene, geocode, notes);
      // Never leave a map empty: fall back to a simple locator on the broad
      // region the LLM named (regionPlace) when mode resolution found nothing.
      if (!map && e.regionPlace) {
        const g = await geocode(String(e.regionPlace));
        if (g) {
          const iso = alpha2ToNumeric(g.countryCode);
          map = {
            mode: "locator", center: g.center, scale: g.scale,
            camera: { keyframes: [{ atMs: 0, center: g.center, scale: Math.round(g.scale * 0.7) }, { atMs: Math.round((scene.durationMs ?? 5000) * 0.25), center: g.center, scale: g.scale }] },
            highlights: iso ? [{ iso, color: "primary", opacity: 0.7 }] : [],
          };
          notes.push(`${scene.id}: map fell back to locator on "${e.regionPlace}"`);
        }
      }
      if (map) {
        style.map = map;
        notes.push(`${scene.id}: map mode "${map.mode}" (${(map.markers?.length ?? 0)} markers, ${(map.flows?.length ?? 0)} flows, ${(map.highlights?.length ?? 0)} highlights)`);
      } else {
        notes.push(`${scene.id}: map not resolved (no geocodable places)`);
      }
    } else if (scene.visual.type === "stat" || scene.visual.type === "chart") {
      if (e.data && typeof e.data === "object") {
        style.data = e.data;
        notes.push(`${scene.id}: data mode "${e.data.mode}"`);
      } else if (e.numericValue !== undefined) {
        // tolerate the older flat stat shape
        style.data = { mode: "bigStat", value: Number(e.numericValue), prefix: e.valuePrefix, suffix: e.valueSuffix, context: e.context, title: e.label, accent: e.accentColor };
        notes.push(`${scene.id}: data mode "bigStat" (legacy shape)`);
      }
    } else if (scene.visual.type === "comparison") {
      if (e.heading) style.heading = e.heading;
      if (e.left) style.left = e.left;
      if (e.right) style.right = e.right;
      notes.push(`${scene.id}: comparison → ${e.left?.label ?? "?"} vs ${e.right?.label ?? "?"}`);
    } else if (scene.visual.type === "timeline") {
      if (e.timeline && typeof e.timeline === "object") {
        style.timeline = e.timeline;
        notes.push(`${scene.id}: timeline mode "${e.timeline.mode}"`);
      }
    } else if (scene.visual.type === "quoteCard") {
      if (e.quote && typeof e.quote === "object") {
        style.quote = e.quote;
        notes.push(`${scene.id}: quote mode "${e.quote.mode}"`);
      }
    } else if (scene.visual.type === "titleCard") {
      if (e.titleCard && typeof e.titleCard === "object") {
        style.titleCard = e.titleCard;
        notes.push(`${scene.id}: title mode "${e.titleCard.mode}"`);
      }
    } else if (scene.visual.type === "archivalPhoto" || scene.visual.type === "genImage") {
      if (e.photo && typeof e.photo === "object") {
        style.photo = e.photo;
        notes.push(`${scene.id}: photo mode "${e.photo.mode}" (${e.photo.items?.length ?? 0} imgs)`);
      }
    } else if (scene.visual.type === "newspaper") {
      if (e.newspaper && typeof e.newspaper === "object") {
        style.newspaper = e.newspaper;
        notes.push(`${scene.id}: newspaper mode "${e.newspaper.mode}"`);
      }
    } else if (scene.visual.type === "document") {
      if (e.document && typeof e.document === "object") {
        const doc = e.document;
        // word-sync the highlight reveal to the spoken key passage
        const cueT = doc.highlightCue ? findWordTime(scene.wordTimings, String(doc.highlightCue)) : undefined;
        if (cueT !== undefined) doc.highlightAtMs = cueT;
        delete doc.highlightCue;
        style.document = doc;
        notes.push(`${scene.id}: document mode "${doc.mode}"`);
      }
    } else if (scene.visual.type === "globe") {
      const g = (e.globe && typeof e.globe === "object") ? await resolveGlobeStyle(e.globe, scene, geocode) : undefined;
      if (g) {
        style.globe = g;
        notes.push(`${scene.id}: globe mode "${g.mode}" (${g.arcs?.length ?? 0} arcs, ${g.highlights?.length ?? 0} highlights)`);
      } else {
        notes.push(`${scene.id}: globe not resolved (no geocodable place)`);
      }
    } else if (scene.visual.type === "video") {
      if (e.video && typeof e.video === "object") {
        const v = e.video;
        // freeze mode: word-sync the picture lock to the spoken cue word
        const cueT = v.freezeCue ? findWordTime(scene.wordTimings, String(v.freezeCue)) : undefined;
        if (cueT !== undefined) v.freezeAtMs = cueT;
        delete v.freezeCue;
        style.video = v;
        notes.push(`${scene.id}: video mode "${v.mode}" (${(v.clips ?? []).length} clip(s))`);
      }
    }

    scene.visual.style = style;
    enriched++;
  }

  return { storyboard: sb, enriched, skipped: targets.length - enriched, quotaHit: false, notes };
}

// ─── Map mode resolution: semantic LLM JSON → render-ready MapSpec ───────────────

type Geo = Awaited<ReturnType<typeof geocodePlace>>;

/** Center + scale that frames all given [lon,lat] points with context margin. */
function fitView(centers: [number, number][]): { center: [number, number]; scale: number } {
  if (centers.length === 0) return { center: [20, 30], scale: 600 };
  const lons = centers.map((c) => c[0]);
  const lats = centers.map((c) => c[1]);
  const w = Math.max(2, Math.max(...lons) - Math.min(...lons));
  const h = Math.max(2, Math.max(...lats) - Math.min(...lats));
  const cx = (Math.max(...lons) + Math.min(...lons)) / 2;
  const cy = (Math.max(...lats) + Math.min(...lats)) / 2;
  const sLon = 1100 / ((w * 1.5 * Math.PI) / 180);
  const mercY = (d: number) => Math.log(Math.tan(Math.PI / 4 + (d * Math.PI) / 180 / 2));
  const sLat = 620 / Math.max(0.02, Math.abs(mercY(cy + (h * 1.5) / 2) - mercY(cy - (h * 1.5) / 2)));
  const scale = Math.round(Math.max(180, Math.min(4200, Math.min(sLon, sLat))));
  return { center: [cx, cy], scale };
}

const highlightOf = (iso: any, role?: string) => ({
  iso: String(iso),
  color: role ?? "primary",
  opacity: role === "accent" ? 0.5 : role === "text" ? 0.22 : 0.7,
});

const wideThenZoom = (center: [number, number], scale: number, dur: number) => ({
  keyframes: [
    { atMs: 0, center, scale: Math.round(scale * 0.7) },
    { atMs: Math.round(dur * 0.22), center, scale },
  ],
});

/** Builds a render-ready MapSpec for any supported mode. Geocodes deterministically. */
async function resolveMapStyle(
  e: any,
  scene: any,
  geocode: (place?: string) => Promise<Geo>,
  notes: string[]
): Promise<any | undefined> {
  const dur = scene.durationMs ?? 5000;
  const wt = scene.wordTimings;
  const cueMs = (cue?: string) => (cue ? findWordTime(wt, String(cue)) : undefined);
  const mode: string =
    e.mode ||
    (e.flows ? "flows" : e.steps ? "spread" : e.route ? "route" : Array.isArray(e.places) && e.places.length >= 2 ? "tour" : "locator");

  if (mode === "compare") {
    const places = (e.places ?? []).slice(0, 3);
    const geos: { g: NonNullable<Geo>; p: any }[] = [];
    for (const p of places) { const g = await geocode(p.place); if (g) geos.push({ g, p }); }
    if (!geos.length) return undefined;
    const view = fitView(geos.map((x) => x.g.center));
    return {
      mode: "compare", center: view.center, scale: view.scale, camera: wideThenZoom(view.center, view.scale, dur),
      highlights: geos.filter((x) => Number.isFinite(Number(x.p.isoNumeric))).map((x) => highlightOf(x.p.isoNumeric, x.p.role)),
      sideLabels: geos.map((x) => ({ text: x.p.label ?? x.p.place, color: x.p.role })),
    };
  }

  if (mode === "flows") {
    const src = await geocode(e.source?.place);
    const targets: { g: NonNullable<Geo>; f: any }[] = [];
    for (const f of (e.flows ?? []).slice(0, 4)) { const g = await geocode(f.place); if (g) targets.push({ g, f }); }
    if (!src || !targets.length) return undefined;
    const view = fitView([src.center, ...targets.map((t) => t.g.center)]);
    const tMs = (i: number, cue?: string) => cueMs(cue) ?? Math.round(dur * (0.2 + 0.55 * (i / Math.max(1, targets.length - 1))));
    return {
      mode: "flows", center: view.center, scale: view.scale, camera: wideThenZoom(view.center, view.scale, dur),
      highlights: (e.highlightIso ?? []).map((iso: any) => highlightOf(iso, "text")),
      flows: targets.map((t, i) => ({ from: src.center, to: t.g.center, atMs: tMs(i, t.f.cueWord), color: "accent", label: t.f.label })),
      markers: [
        ...(e.source?.label ? [{ position: src.center, label: e.source.label, atMs: 300, color: "accent" }] : []),
        ...targets.map((t, i) => ({ position: t.g.center, label: t.f.label, atMs: tMs(i, t.f.cueWord) + 200, color: "primary" })),
      ],
    };
  }

  if (mode === "route") {
    const names = [e.route?.from, ...(e.route?.via ?? []), e.route?.to].filter(Boolean);
    const pts: [number, number][] = [];
    const ccs: string[] = [];
    for (const nm of names) { const g = await geocode(nm); if (g) { pts.push(g.center); if (g.countryCode) ccs.push(g.countryCode); } }
    if (pts.length < 2) return undefined;
    const view = fitView(pts);
    const startMs = cueMs(e.route?.cueWord) ?? Math.round(dur * 0.15);
    // Tint the countries the route crosses so the geography reads.
    const highlights = [...new Set(ccs)]
      .map((cc) => alpha2ToNumeric(cc))
      .filter((iso): iso is string => !!iso)
      .map((iso, i) => highlightOf(iso, i === 0 ? "accent" : "text"));
    return {
      mode: "route", center: view.center, scale: view.scale, camera: wideThenZoom(view.center, view.scale, dur),
      highlights,
      route: { points: pts, atMs: startMs, durationMs: Math.max(2500, dur - startMs - 500), color: "primary", label: e.route?.label },
    };
  }

  if (mode === "spread") {
    const raw = (e.steps ?? []).slice(0, 8);
    const centers: [number, number][] = [];
    const steps: any[] = [];
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      const g = await geocode(s.place);
      if (g) centers.push(g.center);
      if (Number.isFinite(Number(s.isoNumeric))) {
        steps.push({
          iso: String(s.isoNumeric),
          atMs: cueMs(s.cueWord) ?? Math.round(dur * (0.1 + 0.8 * (i / Math.max(1, raw.length - 1)))),
          color: i % 2 === 0 ? "primary" : "accent",
          dateLabel: s.dateLabel,
        });
      }
    }
    if (!steps.length) return undefined;
    const view = fitView(centers.length ? centers : [[20, 30]]);
    return { mode: "spread", center: view.center, scale: view.scale, camera: { keyframes: [{ atMs: 0, center: view.center, scale: view.scale }] }, steps };
  }

  // locator / tour — places[] with word-synced camera + markers
  const places = (Array.isArray(e.places) ? e.places : []).slice(0, 4);
  const geos: { g: NonNullable<Geo>; p: any }[] = [];
  for (const p of places) { const g = await geocode(p.place); if (g) geos.push({ g, p }); else notes.push(`${scene.id}: geocode miss "${p.place}"`); }
  if (!geos.length) return undefined;
  const n = geos.length;
  const fallback = (i: number) => Math.round(dur * (n === 1 ? 0.16 : 0.12 + 0.53 * (i / (n - 1))));
  const arrival = (i: number) => {
    const t = cueMs(geos[i].p.cueWord);
    return t !== undefined ? Math.max(i === 0 ? 800 : 0, t) : fallback(i);
  };
  const keyframes: any[] = [{ atMs: 0, center: geos[0].g.center, scale: Math.round(geos[0].g.scale * 0.52) }];
  const markers: any[] = [];
  const highlights: any[] = [];
  let prev = 0;
  geos.forEach((x, i) => {
    const at = Math.max(prev + 150, arrival(i));
    prev = at;
    keyframes.push({ atMs: at, center: x.g.center, scale: x.g.scale });
    if (x.p.label) markers.push({ position: x.g.center, label: x.p.label, sublabel: x.p.sublabel, atMs: at + 150, color: i === 0 ? "primary" : "accent" });
    // Always color the country: LLM isoNumeric if given, else the geocoded country.
    const iso = Number.isFinite(Number(x.p.isoNumeric)) ? x.p.isoNumeric : alpha2ToNumeric(x.g.countryCode);
    if (iso) highlights.push(highlightOf(iso, x.p.role ?? (i === 0 ? "primary" : "accent")));
  });
  return {
    mode: n >= 2 ? "tour" : "locator",
    center: geos[n - 1].g.center, scale: geos[n - 1].g.scale,
    camera: { keyframes }, markers, highlights,
  };
}

// ─── Globe resolution: semantic LLM JSON → render-ready GlobeSpec ────────────────

async function resolveGlobeStyle(
  e: any,
  scene: any,
  geocode: (place?: string) => Promise<Geo>
): Promise<any | undefined> {
  const wt = scene.wordTimings;
  const cueMs = (cue?: string) => (cue ? findWordTime(wt, String(cue)) : undefined);
  const mode = e.mode || (e.arcs ? "arcs" : "locator");

  const highlights: any[] = (e.highlightCountries ?? [])
    .filter((h: any) => Number.isFinite(Number(h.isoNumeric)))
    .map((h: any) => ({ iso: String(h.isoNumeric), color: h.role ?? "primary", opacity: h.role === "accent" ? 0.6 : 0.82 }));
  const addCountry = (cc?: string, color = "accent", opacity = 0.6) => {
    const iso = alpha2ToNumeric(cc);
    if (iso && !highlights.find((h) => h.iso === iso)) highlights.push({ iso, color, opacity });
  };

  const markers: any[] = [];
  for (const m of e.markers ?? []) {
    const g = await geocode(m.place);
    if (g) markers.push({ position: g.center, label: m.label, atMs: cueMs(m.cueWord) ?? 0 });
  }

  const arcs: any[] = [];
  for (const a of e.arcs ?? []) {
    const f = await geocode(a.fromPlace);
    const t = await geocode(a.toPlace);
    if (f && t) {
      arcs.push({ from: f.center, to: t.center, atMs: cueMs(a.cueWord) ?? 600, color: "accent", label: a.label });
      addCountry(f.countryCode, "accent", 0.55);
      addCountry(t.countryCode, "primary", 0.82);
    }
  }

  // Spherical centroid of all geocoded points — frames the whole set of arcs/markers
  // correctly even when they straddle continents (naive lon/lat averaging breaks there).
  const pts: [number, number][] = [
    ...arcs.flatMap((a) => [a.from, a.to] as [number, number][]),
    ...markers.map((m) => m.position as [number, number]),
  ];
  const centroid = sphericalCentroid(pts);

  // Center selection:
  //  • arcs  → centroid of endpoints (a vague "midpoint region" string often mis-geocodes)
  //  • locator → the named centerPlace (one clear subject), then centroid, then a highlight country
  let center: [number, number] | undefined;
  const centerGeo = e.centerPlace ? await geocode(String(e.centerPlace)) : null;
  if (mode === "arcs") {
    center = centroid ?? centerGeo?.center;
  } else {
    center = centerGeo?.center ?? centroid;
    if (!center && e.highlightCountries?.[0]?.name) { const g = await geocode(String(e.highlightCountries[0].name)); if (g) center = g.center; }
  }

  if (!center && !arcs.length && !markers.length && !highlights.length) return undefined;
  return {
    mode,
    center,
    highlights: highlights.length ? highlights : undefined,
    markers: markers.length ? markers : undefined,
    arcs: arcs.length ? arcs : undefined,
  };
}

/**
 * A globe-framing center for a set of points. Longitude is the 3D unit-vector mean
 * (correct across continents/the antimeridian, where naive averaging fails); latitude
 * is the plain arithmetic mean (the vector mean pulls toward the pole when points are
 * spread in longitude, which over-tilts the globe away from where the action sits).
 */
function sphericalCentroid(points: [number, number][]): [number, number] | undefined {
  if (!points.length) return undefined;
  let x = 0, y = 0, latSum = 0;
  for (const [lon, lat] of points) {
    const λ = (lon * Math.PI) / 180;
    x += Math.cos(λ);
    y += Math.sin(λ);
    latSum += lat;
  }
  const lon = Math.hypot(x, y) < 1e-9 ? points[0][0] : (Math.atan2(y, x) * 180) / Math.PI;
  const lat = latSum / points.length;
  return [lon, lat];
}
