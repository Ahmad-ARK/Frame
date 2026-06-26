import "dotenv/config";
import { mapPool } from "../util/pool.js";

// FLUX.1-dev text-to-image adapter (self-hosted on Modal).
// Unlike the search adapters (Wikimedia / Internet Archive), this GENERATES an
// image from a prompt and returns the raw PNG bytes. Used for `genImage` scenes
// where no real photograph exists — generative imagery is a garnish, used
// intentionally, never a substitute for real archival photos.

export type FluxOptions = {
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
};

/** Thrown when credentials are missing — not retryable; tells the user what to do. */
export class FluxAuthError extends Error {}

function auth(): { key: string; secret: string } {
  const key = process.env.FLUX_MODAL_KEY;
  const secret = process.env.FLUX_MODAL_SECRET;
  if (!key || !secret) {
    throw new FluxAuthError(
      "FLUX_MODAL_KEY / FLUX_MODAL_SECRET are not set. Add them to pipeline/.env " +
        "(Modal → Settings → Proxy Auth Tokens) to generate genImage scenes."
    );
  }
  return { key, secret };
}

function singleEndpoint(): string {
  const endpoint = process.env.FLUX_ENDPOINT;
  if (!endpoint) {
    throw new FluxAuthError(
      "FLUX_ENDPOINT is not set. Add your Modal single-image web endpoint URL to pipeline/.env."
    );
  }
  return endpoint;
}

/** The batched Modal endpoint (pipeline/modal/flux_batch_app.py), if deployed. */
function batchEndpoint(): string | undefined {
  return process.env.FLUX_BATCH_ENDPOINT?.trim() || undefined;
}

function creds(): { endpoint: string; key: string; secret: string } {
  return { endpoint: singleEndpoint(), ...auth() };
}

const isTransient = (msg: string) =>
  /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|\b(429|500|502|503|504)\b/i.test(msg);

/**
 * Generates an image from a prompt and returns PNG bytes. Retries transient
 * failures (network / cold-start 5xx) with a long backoff — Modal spins a
 * container up from zero on the first call.
 */
export async function generateFluxImage(
  prompt: string,
  opts: FluxOptions = {}
): Promise<Buffer> {
  const { endpoint, key, secret } = creds();
  const body = JSON.stringify({
    prompt,
    width: opts.width ?? 1536,
    height: opts.height ?? 864, // 16:9, multiples of 16
    steps: opts.steps ?? 28,
    guidance: opts.guidance ?? 3.5,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  });

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 240_000); // cold start + gen
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Modal-Key": key,
            "Modal-Secret": secret,
            "Content-Type": "application/json",
          },
          body,
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          throw new FluxAuthError("FLUX endpoint returned 401 — check FLUX_MODAL_KEY/SECRET.");
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`FLUX ${res.status} ${res.statusText} ${text.slice(0, 120)}`);
        }
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof FluxAuthError) throw err; // never retry auth
      lastErr = err;
      const msg = String((err as Error)?.message ?? err);
      if (attempt < maxAttempts && isTransient(msg)) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export type FluxResult = Buffer | { error: Error };
export const isFluxError = (r: FluxResult): r is { error: Error } =>
  typeof (r as { error?: Error }).error !== "undefined";

/**
 * Generate MANY images as cheaply as the deployment allows.
 *
 * - If `FLUX_BATCH_ENDPOINT` is set (the batched Modal app in
 *   pipeline/modal/flux_batch_app.py), prompts are sent in chunks of `batchSize`
 *   to ONE warm L40S — one container, one cold start, true GPU batching. This is
 *   the real per-image cost win.
 * - Otherwise it falls back to bounded-concurrency calls against the single-image
 *   endpoint. NOTE: concurrency > 1 against a one-input-per-container Modal app
 *   spins up extra L40S containers — faster, but it trades cost for speed, it
 *   does NOT save credits. Default concurrency is 1 (keep one container warm,
 *   back-to-back) precisely so the fallback stays cost-neutral.
 *
 * Returns one result per prompt, in order: a PNG Buffer or `{ error }`. A single
 * prompt's failure never aborts the rest.
 */
export async function generateFluxImages(
  prompts: string[],
  opts: FluxOptions & { concurrency?: number; batchSize?: number } = {}
): Promise<FluxResult[]> {
  if (prompts.length === 0) return [];
  const ep = batchEndpoint();
  if (ep) return generateViaBatch(ep, prompts, opts);

  const concurrency = opts.concurrency ?? 1; // cost-neutral default: one warm container
  return mapPool(prompts, concurrency, async (p) => {
    try {
      return await generateFluxImage(p, opts);
    } catch (err) {
      return { error: err as Error };
    }
  });
}

/** POST prompts to the batched endpoint in VRAM-sized chunks; decode the PNGs. */
async function generateViaBatch(
  endpoint: string,
  prompts: string[],
  opts: FluxOptions & { batchSize?: number }
): Promise<FluxResult[]> {
  const { key, secret } = auth();
  const chunkSize = Math.max(1, opts.batchSize ?? 3); // ~2-4 fit on a 48GB L40S at 16:9
  const out: FluxResult[] = [];
  for (let i = 0; i < prompts.length; i += chunkSize) {
    const chunk = prompts.slice(i, i + chunkSize);
    const body = JSON.stringify({
      prompts: chunk,
      width: opts.width ?? 1536,
      height: opts.height ?? 864,
      steps: opts.steps ?? 28,
      guidance: opts.guidance ?? 3.5,
    });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 360_000); // cold start + N images
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Modal-Key": key, "Modal-Secret": secret, "Content-Type": "application/json" },
          body,
          signal: ctrl.signal,
        });
        if (res.status === 401) throw new FluxAuthError("FLUX batch endpoint returned 401 — check FLUX_MODAL_KEY/SECRET.");
        if (!res.ok) throw new Error(`FLUX batch ${res.status} ${res.statusText} ${(await res.text().catch(() => "")).slice(0, 120)}`);
        const json = (await res.json()) as { images?: string[] };
        const images = json.images ?? [];
        for (let k = 0; k < chunk.length; k++) {
          out.push(images[k] ? Buffer.from(images[k], "base64") : { error: new Error("batch endpoint returned no image for prompt") });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      for (const _ of chunk) out.push({ error: err as Error });
    }
  }
  return out;
}

/** Builds a documentary-styled generation prompt from a scene directive. */
export function buildFluxPrompt(directive: string, override?: string): string {
  if (override) return override;
  return `${directive.trim().replace(/\.$/, "")}. Cinematic documentary still, dramatic natural lighting, photographic realism, muted desaturated color grade, 16:9 composition.`;
}
