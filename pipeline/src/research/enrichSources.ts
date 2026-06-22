import { type Storyboard } from "../schema/storyboard.js";
import { isQuotaError } from "../gemini/client.js";
import { findSource } from "./groundedSource.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EnrichOptions = {
  /** Stop after filling this many claims (for quota control / testing). */
  max?: number;
  /** Delay between grounded calls to respect rate limits. Default 1200ms. */
  delayMs?: number;
  /** Per-claim progress callback. */
  onProgress?: (info: {
    sceneId: string;
    claim: string;
    result: "filled" | "not-found";
    sourceUrl?: string;
    index: number;
    total: number;
  }) => void;
};

export type EnrichResult = {
  storyboard: Storyboard;
  filled: number;
  notFound: number;
  skipped: number;
  /** True if the run aborted early because the API quota was exhausted. */
  quotaHit: boolean;
};

/** A claim is "unsourced" if it has no usable sourceUrl yet. */
const needsSourcing = (sourceUrl: string) => sourceUrl.trim().length === 0;

/**
 * Walks every scene's claims and fills empty sourceUrls using grounded search.
 * Mutates a deep copy; the original storyboard is untouched. Already-sourced
 * claims are left as-is (idempotent / re-runnable).
 */
export async function enrichStoryboardSources(
  input: Storyboard,
  opts: EnrichOptions = {}
): Promise<EnrichResult> {
  const delayMs = opts.delayMs ?? 1200;
  const sb: Storyboard = structuredClone(input);

  const targets: { sceneId: string; claimIndex: number; sceneIdx: number }[] = [];
  sb.scenes.forEach((scene, sceneIdx) => {
    scene.sources.forEach((src, claimIndex) => {
      if (needsSourcing(src.sourceUrl)) targets.push({ sceneId: scene.id, claimIndex, sceneIdx });
    });
  });

  const total = opts.max ? Math.min(opts.max, targets.length) : targets.length;
  let filled = 0;
  let notFound = 0;
  let processed = 0;
  let quotaHit = false;

  for (let i = 0; i < total; i++) {
    const { sceneIdx, claimIndex } = targets[i];
    const scene = sb.scenes[sceneIdx];
    const fact = scene.sources[claimIndex];

    let result: "filled" | "not-found" = "not-found";
    try {
      const found = await findSource(fact.claim);
      if (found) {
        fact.sourceUrl = found.sourceUrl;
        if (found.sourceTitle) fact.sourceTitle = found.sourceTitle;
        filled++;
        result = "filled";
      } else {
        notFound++;
      }
    } catch (err) {
      // Daily quota exhausted: every remaining call will fail the same way, so
      // stop now and let the caller report a clean resume path. Partial
      // progress is preserved (the run is idempotent on re-run).
      if (isQuotaError(err)) {
        quotaHit = true;
        break;
      }
      // Any other single-claim failure should not abort the whole run.
      notFound++;
      console.error(`  ✗ ${scene.id}: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
    }

    processed++;
    opts.onProgress?.({
      sceneId: scene.id,
      claim: fact.claim,
      result,
      sourceUrl: result === "filled" ? fact.sourceUrl : undefined,
      index: i + 1,
      total,
    });

    if (i < total - 1) await sleep(delayMs);
  }

  // Everything we did not get to (either --max capped or quota-aborted).
  const skipped = targets.length - processed;
  return { storyboard: sb, filled, notFound, skipped, quotaHit };
}
