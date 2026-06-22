import { generateGrounded, type GroundingChunk } from "../gemini/client.js";

export type FoundSource = {
  sourceUrl: string;
  sourceTitle?: string;
};

// Domain reputation tiers for ranking grounding citations. Higher = preferred.
const DOMAIN_TIERS: { score: number; test: RegExp }[] = [
  { score: 5, test: /(^|\.)wikipedia\.org$/i },
  { score: 5, test: /(^|\.)britannica\.com$/i },
  { score: 5, test: /\.gov$/i },
  { score: 5, test: /\.edu$/i },
  { score: 4, test: /(^|\.)(reuters|apnews|bbc|nytimes|theguardian|washingtonpost|economist|aljazeera|npr|pbs)\.(com|org|co\.uk)$/i },
  { score: 3, test: /(^|\.)(history|nationalgeographic|smithsonianmag|jstor|brookings|cfr|rand|un)\.(com|org)$/i },
];

function domainOf(titleOrUrl: string): string {
  // grounding chunk titles are already bare domains like "wikipedia.org";
  // urls need parsing.
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(titleOrUrl)) return titleOrUrl.toLowerCase();
  try {
    return new URL(titleOrUrl).hostname.toLowerCase();
  } catch {
    return titleOrUrl.toLowerCase();
  }
}

function reputationScore(chunk: GroundingChunk): number {
  const domain = domainOf(chunk.title ?? chunk.uri);
  for (const tier of DOMAIN_TIERS) if (tier.test.test(domain)) return tier.score;
  return 1;
}

/** Resolves a grounding redirect URI to its canonical destination URL. */
async function resolveRedirect(uri: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com/.test(uri)) return uri;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(uri, { redirect: "follow", signal: ctrl.signal });
    return res.url && !res.url.includes("vertexaisearch") ? res.url : uri;
  } catch {
    return uri; // keep the (still-valid) grounding citation on failure
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Finds the single most authoritative source for a factual claim using
 * Google Search grounding. Returns null if grounding produced no citations.
 */
export async function findSource(claim: string): Promise<FoundSource | null> {
  const { chunks } = await generateGrounded({
    user: `Find the single most authoritative, citable source that supports this factual claim. Prefer encyclopedic, governmental, academic, or major-news sources. Answer in one sentence and cite the source.\n\nClaim: ${claim}`,
  });

  if (chunks.length === 0) return null;

  const best = [...chunks].sort((a, b) => reputationScore(b) - reputationScore(a))[0];
  const sourceUrl = await resolveRedirect(best.uri);
  return { sourceUrl, sourceTitle: best.title };
}
