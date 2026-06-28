import { type AssetLicense } from "./license.js";
import { type FoundImage, type FinderOptions } from "./types.js";

// Internet Archive image adapter. Keyless (archive.org).
//
// IA license metadata is inconsistent: many items have no license at all, and
// uploaded CC items are frequently by-nc / by-nd (non-commercial / no-derivs),
// which a monetized channel must NOT use. So we are deliberately conservative:
// accept only clearly-free items (CC0 / public domain / CC BY), and skip
// everything ambiguous, non-commercial, or no-derivatives.

const SEARCH = "https://archive.org/advancedsearch.php";
const META = "https://archive.org/metadata";
const DL = "https://archive.org/download";
const UA = "documentary-pipeline/0.1 (asset fetcher; contact via project)";

type SearchDoc = {
  identifier: string;
  title?: string;
  licenseurl?: string;
  rights?: string;
  "possible-copyright-status"?: string;
  creator?: string;
  collection?: string | string[];
};

// US-government / institutional collections whose items are public domain by law
// even when they carry no explicit licenseurl (e.g. the CIA reading-room releases,
// the US National Archives). Used to admit authentic primary-source SCANS that
// would otherwise be dropped by the strict license gate.
const PD_TEXT_COLLECTIONS =
  /\b(cia|nara|usfederalgovernment|us_government_documents|gpo|nationalsecurityarchive|fbi|department_?of_?state|nasa)\b/i;

// Strip Lucene special characters so an LLM subject can't break the query syntax,
// then build a relevance query that BOOSTS title matches over description matches —
// an item whose TITLE is about the subject is far more likely to actually depict it
// than one that merely mentions it in a long description.
function iaTermQuery(raw: string): string {
  const cleaned = raw.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "*";
  return `(title:(${cleaned})^3 OR ${cleaned})`;
}

async function fetchJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`Internet Archive ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  throw lastErr;
}

type IADecision = { accept: boolean; license: AssetLicense };

/** Classify an IA item's usage rights from its license/rights fields. */
function classifyIA(doc: SearchDoc, creator?: string): IADecision {
  const url = (doc.licenseurl ?? "").toLowerCase();
  const status = (doc["possible-copyright-status"] ?? "").toLowerCase();
  const rights = (doc.rights ?? "").toLowerCase();
  const who = (creator || doc.creator || "Unknown").toString();
  const attrib = (lic: string) => `${who} · ${lic} · via Internet Archive`;

  // Non-commercial / no-derivatives — never usable for the channel.
  if (/by-nc|by-nd|nc-nd|\/nc\/|\/nd\//.test(url)) {
    return { accept: false, license: { type: "CC (NC/ND)", attributionRequired: true } };
  }
  // Public domain / CC0.
  if (
    /publicdomain|\/cc0\/|creativecommons\.org\/(publicdomain|share-your-work\/public-domain)/.test(url) ||
    /not_in_copyright|public[\s_-]?domain/.test(status) ||
    /public domain/.test(rights)
  ) {
    return { accept: true, license: { type: "PD", attributionRequired: false } };
  }
  // CC BY-SA — share-alike; skip by default (caller may allow).
  if (/by-sa/.test(url)) {
    return {
      accept: false,
      license: { type: "CC BY-SA", attributionRequired: true, attributionText: attrib("CC BY-SA") },
    };
  }
  // Plain CC BY.
  if (/\/by\//.test(url) || /licenses\/by\b/.test(url)) {
    return {
      accept: true,
      license: { type: "CC BY", attributionRequired: true, attributionText: attrib("CC BY") },
    };
  }
  // No recognizable free license — skip.
  return { accept: false, license: { type: "unknown", attributionRequired: true } };
}

const mimeFromFormat = (fmt: string): string | null =>
  /jpeg|jpg/i.test(fmt) ? "image/jpeg" : /png/i.test(fmt) ? "image/png" : null;

/** Pick the largest non-thumbnail JPEG/PNG file from an item's metadata. */
async function bestImageFile(
  identifier: string
): Promise<{ name: string; mime: string } | null> {
  const meta = await fetchJson(`${META}/${identifier}`);
  const files: any[] = meta?.files ?? [];
  const usable = files
    .filter((f) => {
      const mime = mimeFromFormat(f.format ?? "");
      if (!mime) return false;
      if (/thumb/i.test(f.format ?? "") || /thumb/i.test(f.name ?? "")) return false;
      return Number(f.size ?? 0) >= 50_000; // skip tiny icons
    })
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
  if (usable.length === 0) return null;
  const f = usable[0];
  return { name: f.name, mime: mimeFromFormat(f.format)! };
}

// ─── Footage (B-roll) ────────────────────────────────────────────────────────

const VIDEO_FLOOR = 700_000;     // skip thumbs/tiny derivatives
const VIDEO_CAP = 70_000_000;    // prefer compact web derivatives — whole-film masters
                                 // (100s of MB) are slow to fetch and we only show seconds

// Lower = preferred. PD ≈ genuine historical archival film; CC variants are more
// often modern re-uploads.
const licenseRank = (type: string): number => (type === "PD" ? 0 : type === "CC BY" ? 1 : 2);

const videoMimeFromFormat = (fmt: string, name: string): string | null => {
  const f = fmt.toLowerCase();
  if (/h\.?264|mpeg4|mp4/.test(f) || /\.mp4$/i.test(name)) return "video/mp4";
  if (/webm/.test(f) || /\.webm$/i.test(name)) return "video/webm";
  return null; // skip mov/mpg/mkv/ogv — unreliable in the renderer
};

/**
 * Pick the smallest license-free, web-playable derivative (mp4 preferred) above a
 * size floor. IA auto-generates low-bitrate mp4 derivatives that are small to
 * download yet fine for graded, vignetted B-roll — far better than pulling a
 * multi-GB master for a few seconds of footage.
 */
async function bestVideoFile(identifier: string): Promise<{ name: string; mime: string } | null> {
  const meta = await fetchJson(`${META}/${identifier}`);
  const files: any[] = meta?.files ?? [];
  const usable = files
    .map((f) => ({ f, mime: videoMimeFromFormat(f.format ?? "", f.name ?? ""), size: Number(f.size ?? 0) }))
    .filter(({ mime, size, f }) => mime && size >= VIDEO_FLOOR && size <= VIDEO_CAP && !/thumb|sample/i.test(f.name ?? ""))
    .sort((a, b) => (a.mime === b.mime ? a.size - b.size : a.mime === "video/mp4" ? -1 : 1));
  if (usable.length === 0) return null;
  return { name: usable[0].f.name, mime: usable[0].mime! };
}

/**
 * Returns up to `max` clearly-free B-roll candidates on the Internet Archive,
 * PD-preferred, deduped by item. The caller can then VISION-VERIFY each in order
 * (keyword search alone can't tell a mushroom cloud from a cartoon).
 */
export async function findInternetArchiveVideoCandidates(
  query: string,
  opts: FinderOptions & { max?: number } = {}
): Promise<FoundImage[]> {
  const limit = opts.searchLimit ?? 30;
  const max = opts.max ?? 4;

  // One search pass for a given query string.
  // Footage is mostly historical: a large share of usable clips are US-government
  // or otherwise public-domain-BY-STATUS films that carry NO licenseurl. Requiring
  // a CC licenseurl (as we do for images) would discard nearly all of them — so we
  // also admit items flagged Public Domain by copyright status. classifyIA still
  // makes the final accept/reject call per item.
  const search = async (q: string, need: number): Promise<FoundImage[]> => {
    const params = new URLSearchParams({
      // Also admit Prelinger Archives — a hand-curated trove of public-domain
      // historical/ephemeral film, the cleanest source of genuine archival B-roll.
      q: `${iaTermQuery(q)} AND mediatype:movies AND (licenseurl:[* TO *] OR possible-copyright-status:"Public Domain" OR collection:prelinger)`,
      rows: String(limit),
      output: "json",
    });
    for (const f of ["identifier", "title", "licenseurl", "rights", "possible-copyright-status", "creator", "collection"]) {
      params.append("fl[]", f);
    }
    const data = await fetchJson(`${SEARCH}?${params}`);
    const docs: SearchDoc[] = data?.response?.docs ?? [];
    const isPrelinger = (doc: SearchDoc) => ([] as string[]).concat(doc.collection ?? []).some((c) => /prelinger/i.test(c));
    // Prefer authentic public-domain archival film. CC-BY "movies" on IA are
    // frequently modern YouTube re-uploads (commentary, news) that merely mention
    // the topic — PD items (and curated Prelinger items) are far more likely to be
    // genuine historical footage.
    const ranked = docs
      .map((doc) => ({ doc, decision: isPrelinger(doc) ? { accept: true, license: { type: "PD", attributionRequired: false } } : classifyIA(doc) }))
      .filter(({ decision }) => decision.accept || (decision.license.type === "CC BY-SA" && opts.allowShareAlike))
      // Prelinger first, then by license quality (PD over CC).
      .sort((a, b) => (Number(isPrelinger(b.doc)) - Number(isPrelinger(a.doc))) || (licenseRank(a.decision.license.type) - licenseRank(b.decision.license.type)));
    const out: FoundImage[] = [];
    for (const { doc, decision } of ranked) {
      if (out.length >= need) break;
      const file = await bestVideoFile(doc.identifier).catch(() => null);
      if (!file) continue;
      out.push({
        url: `${DL}/${doc.identifier}/${encodeURIComponent(file.name)}`,
        mime: file.mime,
        source: "internetArchive",
        license: decision.license,
        title: doc.title,
        descriptionUrl: `https://archive.org/details/${doc.identifier}`,
      });
    }
    return out;
  };

  // Progressive simplification: a verbose subject ("mushroom cloud rising nuclear
  // test footage") over-constrains the AND query and returns nothing; the core
  // terms ("mushroom cloud") match abundant footage. Try full → 4 words → 2 words.
  const words = query.trim().split(/\s+/);
  const variants = [query];
  if (words.length > 4) variants.push(words.slice(0, 4).join(" "));
  if (words.length > 2) variants.push(words.slice(0, 2).join(" "));

  const found: FoundImage[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (found.length >= max) break;
    for (const hit of await search(v, max - found.length)) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      found.push(hit);
    }
  }
  return found;
}

/**
 * Finds the best clearly-free B-roll clip on the Internet Archive for a query.
 * Same conservative license gating as images. Returns null if nothing clean.
 */
export async function findInternetArchiveVideo(
  query: string,
  opts: FinderOptions = {}
): Promise<FoundImage | null> {
  const [first] = await findInternetArchiveVideoCandidates(query, { ...opts, max: 1 });
  return first ?? null;
}

/**
 * Returns up to `max` clearly-free Internet Archive image candidates for a query,
 * so the caller can vision-verify them in order.
 */
export async function findInternetArchiveImageCandidates(
  query: string,
  opts: FinderOptions & { max?: number } = {}
): Promise<FoundImage[]> {
  const limit = opts.searchLimit ?? 15;
  const max = opts.max ?? 4;
  // Require an explicit license: the vast majority of IA images carry no license
  // signal at all, and we must not use unlicensed material on a monetized channel.
  // classifyIA then keeps only CC0 / public-domain / CC BY from this set.
  const params = new URLSearchParams({
    q: `${iaTermQuery(query)} AND mediatype:image AND licenseurl:[* TO *]`,
    rows: String(limit),
    output: "json",
  });
  for (const f of ["identifier", "title", "licenseurl", "rights", "possible-copyright-status", "creator"]) {
    params.append("fl[]", f);
  }
  const data = await fetchJson(`${SEARCH}?${params}`);
  const docs: SearchDoc[] = data?.response?.docs ?? [];

  const out: FoundImage[] = [];
  for (const doc of docs) {
    if (out.length >= max) break;
    const decision = classifyIA(doc);
    const ok =
      decision.accept || (decision.license.type === "CC BY-SA" && opts.allowShareAlike);
    if (!ok) continue;

    const file = await bestImageFile(doc.identifier);
    if (!file) continue;

    out.push({
      url: `${DL}/${doc.identifier}/${encodeURIComponent(file.name)}`,
      mime: file.mime,
      source: "internetArchive",
      license: decision.license,
      title: doc.title,
      descriptionUrl: `https://archive.org/details/${doc.identifier}`,
    });
  }
  return out;
}

const TEXT_PAGE_WIDTH = 1200; // IA renders a first-page image on the fly at this width

/**
 * Returns up to `max` AUTHENTIC SCANNED DOCUMENTS from the Internet Archive's
 * `texts` collection — declassified memos, government reports, historical newspapers
 * (e.g. the CIA reading-room releases). For "document"/"newspaper" scenes this beats
 * a reconstructed page: it's the real primary source. Each candidate's image is the
 * item's FIRST PAGE, which IA derives on demand at `/page/n0_w<width>.jpg`.
 *
 * License: admits an explicit free license, PD-by-status, OR a known US-government /
 * institutional collection that is public domain by law (CIA, NARA, …) — those
 * carry no licenseurl but are unambiguously free for a monetised channel.
 */
export async function findInternetArchiveTextCandidates(
  query: string,
  opts: FinderOptions & { max?: number } = {}
): Promise<FoundImage[]> {
  const limit = opts.searchLimit ?? 15;
  const max = opts.max ?? 4;
  const params = new URLSearchParams({
    q: `${iaTermQuery(query)} AND mediatype:texts AND (licenseurl:[* TO *] OR possible-copyright-status:"Public Domain" OR collection:(cia OR nara OR usfederalgovernment OR gpo OR nationalsecurityarchive))`,
    rows: String(limit),
    output: "json",
  });
  for (const f of ["identifier", "title", "licenseurl", "rights", "possible-copyright-status", "creator", "collection"]) {
    params.append("fl[]", f);
  }
  const data = await fetchJson(`${SEARCH}?${params}`);
  const docs: SearchDoc[] = data?.response?.docs ?? [];

  const out: FoundImage[] = [];
  for (const doc of docs) {
    if (out.length >= max) break;
    let decision = classifyIA(doc);
    if (!decision.accept) {
      const collections = ([] as string[]).concat(doc.collection ?? []);
      const govPD = collections.some((c) => PD_TEXT_COLLECTIONS.test(c));
      if (govPD) decision = { accept: true, license: { type: "PD", attributionRequired: false } };
      else if (!(decision.license.type === "CC BY-SA" && opts.allowShareAlike)) continue;
    }
    out.push({
      url: `${DL}/${doc.identifier}/page/n0_w${TEXT_PAGE_WIDTH}.jpg`,
      mime: "image/jpeg",
      source: "internetArchive",
      license: decision.license,
      title: doc.title,
      descriptionUrl: `https://archive.org/details/${doc.identifier}`,
    });
  }
  return out;
}

/**
 * Finds the best clearly-free image on the Internet Archive for a query.
 * Returns null if nothing license-clean is found.
 */
export async function findInternetArchiveImage(
  query: string,
  opts: FinderOptions = {}
): Promise<FoundImage | null> {
  const [first] = await findInternetArchiveImageCandidates(query, { ...opts, max: 1 });
  return first ?? null;
}
