import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { qwenGenerate } from "../llm/qwen.js";

export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

// Which model backend handles the LLM + vision calls. "gemini" (default) uses the
// Google API; "qwen" routes to the self-hosted Qwen2.5-VL endpoint on Modal
// (no rate caps). generateGrounded stays Gemini-only (search grounding is a
// Gemini feature and is not used in the prepare/render path).
const PROVIDER = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
const useQwen = PROVIDER === "qwen";

// Lazily create the Gemini client only when a Gemini call is actually made, so
// a Qwen-only deployment needs no GEMINI_API_KEY.
let _ai: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your Google AI Studio key (or set LLM_PROVIDER=qwen).");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

export type GenerateJsonOptions = {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type GroundingChunk = { uri: string; title?: string };
export type GroundedResult = {
  text: string;
  chunks: GroundingChunk[];
  queries: string[];
};

export type GenerateGroundedOptions = {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
};

export type VisionImage = { data: string; mimeType: string }; // data = base64
export type GenerateVisionJsonOptions = {
  system: string;
  user: string;
  images: VisionImage[];
  model?: string;
  temperature?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for an API quota/rate-limit (429) error — NOT worth a short-backoff retry. */
export function isQuotaError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /\b429\b/.test(msg) || /quota|exceeded|RESOURCE_EXHAUSTED|rate limit/i.test(msg);
}

/**
 * Transient failures worth retrying with a short backoff: network drops and
 * server overload (5xx). Quota errors (429) are intentionally excluded — a
 * daily free-tier cap will not recover in a few hundred ms, so retrying just
 * burns time; callers handle quota errors by aborting/resuming instead.
 */
function isTransient(err: unknown): boolean {
  if (isQuotaError(err)) return false;
  const msg = String((err as Error)?.message ?? err);
  return (
    /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(msg) ||
    /\b(500|502|503|504)\b/.test(msg)
  );
}

/** Generates JSON from the configured backend and returns the raw response text. */
export async function generateJson(opts: GenerateJsonOptions): Promise<string> {
  if (useQwen) {
    return qwenGenerate({ system: opts.system, user: opts.user, temperature: opts.temperature ?? 0.4, maxTokens: opts.maxTokens });
  }
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: opts.model ?? DEFAULT_MODEL,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          temperature: opts.temperature ?? 0.4,
        },
      });

      const text = res.text;
      if (!text || text.trim().length === 0) {
        throw new Error("Gemini returned an empty response.");
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransient(err)) {
        const backoffMs = 800 * attempt;
        console.error(
          `  Gemini call failed (attempt ${attempt}/${maxAttempts}): ${String(
            (err as Error)?.message ?? err
          ).slice(0, 80)} — retrying in ${backoffMs}ms`
        );
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Multimodal JSON call: sends a text prompt plus one or more images and returns
 * the raw JSON response text. Used to VERIFY that fetched footage/imagery actually
 * depicts a subject (a vision model can tell a mushroom cloud from a cartoon; no
 * amount of keyword metadata can).
 */
export async function generateVisionJson(opts: GenerateVisionJsonOptions): Promise<string> {
  if (useQwen) {
    return qwenGenerate({ system: opts.system, user: opts.user, images: opts.images, temperature: opts.temperature ?? 0 });
  }
  const maxAttempts = 3;
  let lastErr: unknown;
  const parts = [
    { text: opts.user },
    ...opts.images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: opts.model ?? DEFAULT_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          temperature: opts.temperature ?? 0,
        },
      });
      const text = res.text;
      if (!text || text.trim().length === 0) throw new Error("Gemini returned an empty response.");
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransient(err)) {
        await sleep(800 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Calls Gemini with the Google Search grounding tool enabled and returns the
 * text answer plus the grounding citations. Note: the search tool cannot be
 * combined with JSON response mode, so callers parse plain text + chunks.
 */
export async function generateGrounded(
  opts: GenerateGroundedOptions
): Promise<GroundedResult> {
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: opts.model ?? DEFAULT_MODEL,
        contents: opts.user,
        config: {
          ...(opts.system ? { systemInstruction: opts.system } : {}),
          tools: [{ googleSearch: {} }],
          temperature: opts.temperature ?? 0,
        },
      });

      const gm = res.candidates?.[0]?.groundingMetadata;
      const chunks: GroundingChunk[] = (gm?.groundingChunks ?? [])
        .map((c: any) => ({ uri: c.web?.uri, title: c.web?.title }))
        .filter((c: GroundingChunk) => !!c.uri);

      return {
        text: res.text ?? "",
        chunks,
        queries: gm?.webSearchQueries ?? [],
      };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransient(err)) {
        const backoffMs = 800 * attempt;
        console.error(
          `  Grounded call failed (attempt ${attempt}/${maxAttempts}): ${String(
            (err as Error)?.message ?? err
          ).slice(0, 80)} — retrying in ${backoffMs}ms`
        );
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
