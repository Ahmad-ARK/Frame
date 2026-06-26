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

  // Try the full query, then progressively simpler ones (verbose multi-word
  // subjects from the LLM often return nothing on Commons search).
  for (const q of queryVariants(query)) {
    const titles = await searchFiles(q, opts.searchLimit ?? 12);
    const acceptable = (await imageInfo(titles)).filter(accept).sort((a, b) => score(b) - score(a));
    if (acceptable.length) return acceptable.slice(0, opts.max ?? 4);
  }
  return [];
}

/** Convenience: the single best Wikimedia image, or null. */
export async function findWikimediaImage(
  query: string,
  opts: { searchLimit?: number; allowShareAlike?: boolean } = {}
): Promise<WikimediaCandidate | null> {
  const [best] = await findWikimediaImageCandidates(query, { ...opts, max: 1 });
  return best ?? null;
}
