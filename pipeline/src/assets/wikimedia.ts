import { classifyLicense, type AssetLicense, type ExtMetadata } from "./license.js";

// Wikimedia Commons asset adapter. Keyless.
//
// Host routing note: some networks reset connections to `commons.wikimedia.org`
// specifically (SNI filtering), while `api.wikimedia.org`, `en.wikipedia.org`,
// and `upload.wikimedia.org` stay reachable. So we avoid commons.wikimedia.org:
//   - SEARCH   -> api.wikimedia.org Core REST (Commons page search)
//   - METADATA -> en.wikipedia.org action API (returns Commons files via the
//                 shared-repo, including license extmetadata, even when the file
//                 is not local to enwiki)
//   - IMAGES   -> upload.wikimedia.org (the url returned in metadata)
// In an unfiltered/server-side environment these all resolve the same data.

const SEARCH_API = "https://api.wikimedia.org/core/v1/commons/search/page";
const INFO_API = "https://en.wikipedia.org/w/api.php";
const UA = "documentary-pipeline/0.1 (asset fetcher; contact via project)";

export type WikimediaCandidate = {
  title: string; // "File:....jpg"
  url: string; // direct image URL on upload.wikimedia.org
  descriptionUrl: string; // the Commons file page
  width: number;
  height: number;
  mime: string;
  license: AssetLicense;
};

async function fetchJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`Wikimedia API ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      // 429 (rate limit) needs a much longer back-off than a transient blip.
      const is429 = /\b429\b/.test(String((err as Error)?.message ?? err));
      if (attempt < 4) await new Promise((r) => setTimeout(r, (is429 ? 2500 : 600) * attempt));
    }
  }
  throw lastErr;
}

/** Progressive query simplifications: full → first 4 words → first 2 words. */
function queryVariants(query: string): string[] {
  const words = query.trim().split(/\s+/);
  const variants = [query, words.slice(0, 4).join(" "), words.slice(0, 2).join(" ")];
  return variants.filter((q, i, a) => q.length > 0 && a.indexOf(q) === i);
}

/** Search Commons (via the reachable Core REST host); return File: titles. */
async function searchFiles(query: string, limit: number): Promise<string[]> {
  const url = `${SEARCH_API}?${new URLSearchParams({ q: query, limit: String(limit) })}`;
  const data = await fetchJson(url);
  return (data?.pages ?? [])
    .map((p: any) => (p.key ?? p.title ?? "") as string)
    .filter((t: string) => t.startsWith("File:"));
}

/**
 * Entity-first lookup: find the Wikipedia ARTICLES that best match the query and
 * return (a) each article's lead image (the "page image") and (b) the TOP article's
 * Wikidata QID. For a NAMED subject — a person ("Zia ul-Haq"), a place, an org, a
 * named event — the lead image is the canonical portrait/photo, which keyword
 * file-search badly misses (it ranks by filename/description text, so "Zia ul-Haq"
 * can return an unrelated person whose file description merely contains those words).
 * The QID comes from the article (Wikipedia's search already disambiguates — it
 * returns President Zia, not a same-named researcher), and powers a precise
 * "depicts" file search. Lead-image titles are in article-relevance order, restricted
 * to freely-licensed lead images.
 */
async function searchEntity(query: string, limit: number): Promise<{ titles: string[]; qid?: string }> {
  const url = `${INFO_API}?${new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(limit),
    gsrnamespace: "0", // article namespace only
    prop: "pageimages|pageprops",
    piprop: "name",
    pilicense: "free", // only freely-licensed lead images (channel is monetised)
    ppprop: "wikibase_item", // the article's Wikidata QID (for depicts search)
  })}`;
  const data = await fetchJson(url);
  const pages: any[] = Object.values(data?.query?.pages ?? {});
  // `index` reflects search relevance order; keep the best-matching articles first.
  pages.sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
  const titles: string[] = [];
  for (const p of pages) {
    if (typeof p.pageimage === "string" && p.pageimage) {
      const t = `File:${p.pageimage}`;
      if (!titles.includes(t)) titles.push(t);
    }
  }
  const qid: string | undefined = pages[0]?.pageprops?.wikibase_item;
  return { titles, qid };
}

/**
 * "Depicts" search (Wikimedia structured data): files tagged P180=<QID> are
 * EXPLICITLY marked as depicting that exact Wikidata entity — curated metadata, not
 * filename guessing. The single highest-precision way to get real images of a named
 * subject. Runs through the reachable Core REST host (no commons.wikimedia.org).
 */
async function searchByDepicts(qid: string, limit: number): Promise<string[]> {
  const url = `${SEARCH_API}?${new URLSearchParams({ q: `haswbstatement:P180=${qid}`, limit: String(limit) })}`;
  const data = await fetchJson(url);
  return (data?.pages ?? [])
    .map((p: any) => (p.key ?? p.title ?? "") as string)
    .filter((t: string) => t.startsWith("File:"));
}

/** Fetch imageinfo + license extmetadata via the enwiki action API (shared repo). */
async function imageInfo(titles: string[]): Promise<WikimediaCandidate[]> {
  if (titles.length === 0) return [];
  const url = `${INFO_API}?${new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    titles: titles.join("|"),
  })}`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages ?? {};
  const out: WikimediaCandidate[] = [];
  for (const key of Object.keys(pages)) {
    const page = pages[key];
    const info = page?.imageinfo?.[0];
    if (!info?.url) continue;
    const ext = (info.extmetadata ?? {}) as ExtMetadata;
    const { license } = classifyLicense(ext);
    out.push({
      title: page.title,
      url: info.url,
      descriptionUrl: info.descriptionurl ?? "",
      width: info.width ?? 0,
      height: info.height ?? 0,
      mime: info.mime ?? "",
      license,
    });
  }
  return out;
}

const isUsableRaster = (c: WikimediaCandidate) =>
  /^image\/(jpeg|png)$/.test(c.mime) && Math.max(c.width, c.height) >= 800;

/**
 * Returns up to `max` license-clean Wikimedia candidates for a query, ranked
 * (PD/CC0 over CC BY, then larger, preserving search relevance). The caller can
 * vision-verify them in order. Stops at the first query variant that yields hits.
 */
export async function findWikimediaImageCandidates(
  query: string,
  opts: { searchLimit?: number; allowShareAlike?: boolean; max?: number } = {}
): Promise<WikimediaCandidate[]> {
  const accept = (c: WikimediaCandidate) => {
    if (!isUsableRaster(c)) return false;
    if (c.license.type === "PD" || c.license.type === "CC0") return true;
    if (c.license.type === "CC BY") return true;
    if (c.license.type === "CC BY-SA") return !!opts.allowShareAlike;
    return false;
  };
  const score = (c: WikimediaCandidate) => {
    const licenseScore =
      c.license.type === "PD" || c.license.type === "CC0" ? 2
      : c.license.type === "CC BY" ? 1 : 0;
    // De-prioritise multi-panel "montage"/"collage" lead images (the typical
    // Wikipedia article hero) — they read as a messy grid in a single-image slot.
    const montagePenalty = /montage|collage|combo|compilation|\bgrid\b|multiple/i.test(c.title) ? 50_000_000 : 0;
    return licenseScore * 10_000_000 - montagePenalty + c.width * c.height;
  };

  const max = opts.max ?? 4;
  const dedupe = (cs: WikimediaCandidate[]) => {
    const seen = new Set<string>();
    return cs.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
  };

  // 1) ENTITY: resolve the best-matching Wikipedia article → its lead image (the
  //    canonical portrait) + its Wikidata QID. This is what fixes "Zia ul-Haq"
  //    returning a random person.
  const { titles: entityTitles, qid } = await searchEntity(query, Math.max(5, max)).catch(() => ({ titles: [] as string[], qid: undefined }));

  // 2) DEPICTS: files structurally tagged P180=<QID> — guaranteed to show that exact
  //    entity (curated metadata, the highest-precision source). Only when we have a
  //    QID from step 1 (so it's the disambiguated entity, not a same-named other).
  const depictsTitles = qid ? await searchByDepicts(qid, Math.max(6, max * 2)).catch(() => [] as string[]) : [];

  // Resolve lead + depicts titles to candidates in ONE imageinfo batch, then keep
  // each group's relevance order: lead image (the portrait) first, then depicts.
  const entitySet = dedupe((await imageInfo([...new Set([...entityTitles, ...depictsTitles])])).filter(accept));
  const orderOf = (t: string) => {
    const li = entityTitles.indexOf(t);
    if (li >= 0) return li;                         // lead images first, in article order
    const di = depictsTitles.indexOf(t);
    return di >= 0 ? 1000 + di : 2000;              // then depicts, in their order
  };
  entitySet.sort((a, b) => orderOf(a.title) - orderOf(b.title));

  // 3) FULL-TEXT Commons file search (generic/non-entity subjects + extra variety).
  let fulltext: WikimediaCandidate[] = [];
  for (const q of queryVariants(query)) {
    const titles = await searchFiles(q, opts.searchLimit ?? 12);
    const acceptable = dedupe((await imageInfo(titles)).filter(accept)).sort((a, b) => score(b) - score(a));
    if (acceptable.length) { fulltext = acceptable; break; }
  }

  // Entity portrait + depicts (precision) first, then full-text (variety), deduped.
  const combined = dedupe([...entitySet, ...fulltext]);
  return combined.slice(0, max);
}

/** Convenience: the single best Wikimedia image, or null. */
export async function findWikimediaImage(
  query: string,
  opts: { searchLimit?: number; allowShareAlike?: boolean } = {}
): Promise<WikimediaCandidate | null> {
  const [best] = await findWikimediaImageCandidates(query, { ...opts, max: 1 });
  return best ?? null;
}
