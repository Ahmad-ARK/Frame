import "dotenv/config";

// FLUX.1-dev text-to-image adapter (self-hosted on Modal).
// Unlike the search adapters (Wikimedia / Internet Archive), this GENERATES an
// image from a prompt and returns the raw PNG bytes. Used for `genImage` scenes
// where no real photograph exists — generative imagery is a garnish, used
// intentionally, never a substitute for real archival photos.

const DEFAULT_ENDPOINT =
  "https://ahmadkhalid236997--flux-api-model-web.modal.run";

export type FluxOptions = {
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
};

/** Thrown when credentials are missing — not retryable; tells the user what to do. */
export class FluxAuthError extends Error {}

function creds(): { endpoint: string; key: string; secret: string } {
  const key = process.env.FLUX_MODAL_KEY;
  const secret = process.env.FLUX_MODAL_SECRET;
  if (!key || !secret) {
    throw new FluxAuthError(
      "FLUX_MODAL_KEY / FLUX_MODAL_SECRET are not set. Add them to pipeline/.env " +
        "(Modal → Settings → Proxy Auth Tokens) to generate genImage scenes."
    );
  }
  return { endpoint: process.env.FLUX_ENDPOINT ?? DEFAULT_ENDPOINT, key, secret };
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

/** Builds a documentary-styled generation prompt from a scene directive. */
export function buildFluxPrompt(directive: string, override?: string): string {
  if (override) return override;
  return `${directive.trim().replace(/\.$/, "")}. Cinematic documentary still, dramatic natural lighting, photographic realism, muted desaturated color grade, 16:9 composition.`;
}
