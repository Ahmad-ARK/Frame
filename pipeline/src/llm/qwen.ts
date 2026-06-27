import "dotenv/config";

// Client for the self-hosted Qwen2.5-VL endpoint (pipeline/modal/qwen_vl_app.py).
// One call shape serves BOTH text generation (import/enrich) and vision
// (image/footage verification) — Qwen2.5-VL is a vision-language model, so
// passing images or not is the only difference. Auth reuses the same Modal
// proxy-auth tokens as the FLUX app.

export type QwenImage = { data: string; mimeType: string }; // data = base64
export type QwenGenerateOptions = {
  system: string;
  user: string;
  images?: QwenImage[];
  temperature?: number;
  maxTokens?: number;
};

function creds(): { endpoint: string; key: string; secret: string } {
  const endpoint = process.env.QWEN_ENDPOINT?.trim();
  // Use a Qwen-specific proxy-auth token if set (when Qwen lives on a DIFFERENT
  // Modal account than FLUX); otherwise fall back to the FLUX tokens (same account).
  const key = process.env.QWEN_MODAL_KEY ?? process.env.FLUX_MODAL_KEY;
  const secret = process.env.QWEN_MODAL_SECRET ?? process.env.FLUX_MODAL_SECRET;
  if (!endpoint) {
    throw new Error("QWEN_ENDPOINT is not set. Deploy pipeline/modal/qwen_vl_app.py and add its URL to pipeline/.env (with LLM_PROVIDER=qwen).");
  }
  if (!key || !secret) {
    throw new Error("Set QWEN_MODAL_KEY / QWEN_MODAL_SECRET (a proxy-auth token from the SAME Modal account the Qwen endpoint is deployed on), or FLUX_MODAL_KEY / FLUX_MODAL_SECRET if it's the same account.");
  }
  return { endpoint, key, secret };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTransient = (msg: string) =>
  /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|aborted/i.test(msg) ||
  /\b(500|502|503|504)\b/.test(msg);

/** Generate text (optionally over images) from the self-hosted Qwen2.5-VL model. */
export async function qwenGenerate(opts: QwenGenerateOptions): Promise<string> {
  const { endpoint, key, secret } = creds();
  const body = JSON.stringify({
    system: opts.system,
    user: opts.user,
    images: opts.images ?? [],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 4096,
  });

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 300_000); // cold start + generation
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Modal-Key": key, "Modal-Secret": secret, "Content-Type": "application/json" },
          body,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw new Error(`Qwen ${res.status} ${res.statusText} ${(await res.text().catch(() => "")).slice(0, 160)}`);
        }
        const json = (await res.json()) as { text?: string };
        const text = (json.text ?? "").trim();
        if (!text) throw new Error("Qwen returned an empty response.");
        return text;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message ?? err);
      if (attempt < maxAttempts && isTransient(msg)) {
        console.error(`  Qwen call failed (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 80)} — retrying`);
        await sleep(800 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
