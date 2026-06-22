// Deterministic geography → map camera. Resolves a place name to a center
// [lon, lat] and a geoMercator `scale` that frames its bounding box in the
// 1920x1080 viewport. Uses OpenStreetMap Nominatim (keyless). No LLM, no
// hallucinated coordinates.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "documentary-pipeline/0.1 (map enrichment; contact via project)";

// Frame the bbox to fill a comfortable portion of the frame, leaving
// surrounding geographic context (documentary maps read better with context
// than edge-to-edge). Capped so small regions still show neighbours.
const TARGET_W = 1150;
const TARGET_H = 650;
const SCALE_MIN = 180;
const SCALE_MAX = 4200;

export type GeoResult = {
  center: [number, number]; // [lon, lat]
  scale: number; // geoMercator scale (px)
  bbox: [number, number, number, number]; // [south, north, west, east]
  displayName: string;
  countryCode?: string; // ISO 3166-1 alpha-2
};

const mercY = (latDeg: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 180 / 2));

/** geoMercator scale that fits a lon/lat span into the target viewport. */
function scaleForBBox(south: number, north: number, west: number, east: number): number {
  const dLon = Math.max(0.05, Math.abs(east - west));
  const sLon = TARGET_W / ((dLon * Math.PI) / 180);
  const dY = Math.max(1e-4, Math.abs(mercY(north) - mercY(south)));
  const sLat = TARGET_H / dY;
  const scale = Math.min(sLon, sLat);
  return Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale)));
}

const bboxAreaDeg = (bb: number[]) =>
  bb.length === 4 ? Math.abs(bb[1] - bb[0]) * Math.abs(bb[3] - bb[2]) : 0;

/**
 * Picks the best candidate for a documentary map: prefer administrative
 * boundaries (countries / regions / states) over tiny localities so we frame a
 * REGION, not a same-named village. Among those, prefer higher OSM importance,
 * then larger area.
 */
function pickBest(results: any[]): any | undefined {
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const rank = (r: any) => {
    const admin = r.class === "boundary" && r.type === "administrative" ? 2
      : r.class === "place" && /country|state|region|county/.test(r.type) ? 1
      : 0;
    const importance = typeof r.importance === "number" ? r.importance : 0;
    const area = bboxAreaDeg((r.boundingbox ?? []).map((n: string) => parseFloat(n)));
    return admin * 100 + importance * 10 + Math.min(area, 50) / 10;
  };
  return [...results].sort((a, b) => rank(b) - rank(a))[0];
}

/** Resolves a place name to map camera params, or null if not found. */
export async function geocodePlace(query: string): Promise<GeoResult | null> {
  const url = `${NOMINATIM}?${new URLSearchParams({
    q: query,
    format: "json",
    limit: "5",
    addressdetails: "1",
  })}`;

  let data: any;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      // Throttling (429) and transient server errors (5xx) deserve a longer
      // backoff than a normal failure — Nominatim blocks bursts aggressively.
      if (res.status === 429 || res.status >= 500) throw new Error(`Nominatim ${res.status} (throttled)`);
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      if (attempt === 4) throw err;
      const throttled = /throttled/.test(String((err as Error)?.message));
      await new Promise((r) => setTimeout(r, (throttled ? 2500 : 700) * attempt));
    }
  }

  const hit = pickBest(data);
  if (!hit) return null;

  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  // Nominatim boundingbox = [south, north, west, east] as strings.
  const bb = (hit.boundingbox ?? []).map((n: string) => parseFloat(n));
  const [south, north, west, east] =
    bb.length === 4 ? bb : [lat - 2, lat + 2, lon - 2, lon + 2];

  return {
    center: [lon, lat],
    scale: scaleForBBox(south, north, west, east),
    bbox: [south, north, west, east],
    displayName: hit.display_name ?? query,
    countryCode: hit.address?.country_code?.toUpperCase(),
  };
}
