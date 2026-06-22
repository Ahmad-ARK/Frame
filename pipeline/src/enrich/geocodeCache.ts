// Persistent disk cache for geocoding results. Nominatim's usage policy asks
// callers to cache results rather than re-querying the same place — and a place's
// coordinates never change, so a resolved entry is good forever. This also makes
// enrichment resilient to transient Nominatim throttling/blocks: once a place has
// been resolved on any prior run, later runs read it from disk instead of the network.
//
// Only SUCCESSFUL (non-null) results are persisted — a transient failure must not
// poison the cache and permanently mark a real place as unresolvable.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { GeoResult } from "./geocode.js";

const norm = (place: string) => place.trim().toLowerCase().replace(/\s+/g, " ");

export class GeocodeCache {
  private map = new Map<string, GeoResult>();
  private dirty = false;

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, GeoResult>;
      for (const [k, v] of Object.entries(raw)) this.map.set(k, v);
    } catch {
      /* no cache yet — start empty */
    }
  }

  get(place: string): GeoResult | undefined {
    return this.map.get(norm(place));
  }

  set(place: string, result: GeoResult): void {
    this.map.set(norm(place), result);
    this.dirty = true;
  }

  /** Persist to disk if anything changed. Safe to call repeatedly. */
  flush(): void {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const obj: Record<string, GeoResult> = {};
      for (const [k, v] of this.map) obj[k] = v;
      writeFileSync(this.file, JSON.stringify(obj, null, 2));
      this.dirty = false;
    } catch {
      /* cache is best-effort; a write failure must not break enrichment */
    }
  }

  get size(): number {
    return this.map.size;
  }
}
