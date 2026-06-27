// Thin typed client for the local pipeline API. Everything goes through the Vite
// /api proxy (see vite.config.ts) so there's no CORS in dev. Every call funnels
// through request() which normalizes failures into a single ApiError shape the UI
// can show in a toast — network down, proxy-can't-reach-backend, non-2xx, or bad
// JSON all land here. The shapes below mirror the real server contract
// (src/server: status is queued|running|succeeded|failed; /storyboards returns
// {storyboards: string[]}; outputUrl is server-relative "/outputs/<id>.mp4").
import { log } from "./log";

export type JobMode = "render" | "import" | "generate" | "audio" | "prepare";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  mode?: JobMode;
  status: JobStatus;
  stage?: string;
  progress?: number; // 0..1
  label?: string; // human name for the dashboard
  preparedId?: string; // set when a prepare job finishes (for review + render)
  outputUrl?: string; // normalized to a proxy-relative /api/outputs/<id>.mp4 by getJob
  error?: string;
  createdAt?: string;
}

export interface StoryboardSummary {
  id: string;
  title: string;
}

export interface ReviewCandidate {
  ref?: string;
  url?: string;
  kind: "image" | "video";
  source: string;
  thumbUrl?: string;
  caption?: string;
}

export interface ReviewVisual {
  id: string;
  sceneId: string;
  desc: string;
  line: string;
  source: string;
  flagged: boolean;
  thumbUrl?: string;
  candidates?: ReviewCandidate[];
}
export interface ReviewCaption {
  id: string;
  t: string;
  text: string;
}
export interface ReviewData {
  id: string;
  title: string;
  script: string;
  visuals: ReviewVisual[];
  captions: ReviewCaption[];
  verifiedCount: number;
}

export class ApiError extends Error {
  status: number;
  body?: unknown;
  /** true when the request never reached the backend (offline, proxy can't connect). */
  offline: boolean;
  constructor(message: string, opts: { status?: number; body?: unknown; offline?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status ?? 0;
    this.body = opts.body;
    this.offline = opts.offline ?? false;
  }
}

const BASE = "/api";
// Optional bearer key for when the backend runs with API_KEYS set. Unset in dev.
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined)?.trim();

// Gateway codes the Vite proxy emits when the backend is unreachable — treat as
// offline rather than a server-side failure so the UI shows the friendly path.
const GATEWAY_DOWN = new Set([502, 503, 504]);

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 30_000);
  const method = init?.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init?.body && !(init.body instanceof ArrayBuffer) ? { "content-type": "application/json" } : {}),
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof DOMException && err.name === "AbortError";
    const apiErr = new ApiError(
      aborted ? "The request timed out." : "Can't reach the pipeline. Is it running?",
      { offline: true }
    );
    log.warn("api request failed (network)", { method, path, message: apiErr.message });
    throw apiErr;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    if (GATEWAY_DOWN.has(res.status)) {
      const apiErr = new ApiError("Can't reach the pipeline. Is it running?", { status: res.status, offline: true });
      log.warn("api gateway down", { method, path, status: res.status });
      throw apiErr;
    }
    let body: unknown;
    let msg = res.status === 401 ? "Not authorized — check your API key." : `Request failed (${res.status})`;
    try {
      body = await res.json();
      if (body && typeof body === "object" && "error" in body) msg = String((body as any).error);
    } catch {
      /* non-JSON error body (e.g. proxy HTML) — keep the status message */
    }
    const apiErr = new ApiError(msg, { status: res.status, body });
    log.warn("api request rejected", { method, path, status: res.status, message: msg });
    throw apiErr;
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return (await res.text()) as unknown as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("The server sent a response we couldn't read.", { status: res.status });
  }
}

/** Turn a storyboard id ("soviet-afghan-war") into a readable title. */
function titleFromId(id: string): string {
  return id
    .replace(/\.storyboard$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** outputUrl from the backend is server-relative ("/outputs/x.mp4"); the browser
 *  must reach it through the proxy, so re-root it under /api. */
function proxyOutputUrl(u?: string): string | undefined {
  if (!u) return u;
  if (u.startsWith(BASE + "/")) return u;
  if (u.startsWith("/outputs/")) return BASE + u;
  return u;
}

/** "/media/…" asset URLs must go through the proxy too. */
function proxyMediaUrl(u?: string): string | undefined {
  if (!u) return u;
  if (/^https?:\/\//.test(u) || u.startsWith(BASE + "/")) return u;
  if (u.startsWith("/media/")) return BASE + u;
  return u;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health", { timeoutMs: 6000 }),

  listStoryboards: async (): Promise<StoryboardSummary[]> => {
    const { storyboards } = await request<{ storyboards: string[] }>("/storyboards");
    return (storyboards ?? []).map((id) => ({ id, title: titleFromId(id) }));
  },

  createJob: (mode: JobMode, payload: Record<string, unknown>) =>
    request<{ id: string; status: JobStatus }>("/jobs", { method: "POST", body: JSON.stringify({ mode, ...payload }) }),

  getJob: async (id: string): Promise<Job> => {
    const job = await request<Job>(`/jobs/${encodeURIComponent(id)}`);
    return { ...job, outputUrl: proxyOutputUrl(job.outputUrl) };
  },

  listJobs: async (): Promise<Job[]> => {
    const { jobs } = await request<{ jobs: Job[] }>("/jobs");
    return (jobs ?? []).map((j) => ({ ...j, outputUrl: proxyOutputUrl(j.outputUrl) }));
  },

  /** Review data (script, real visuals, real captions) for a prepared film or a
   *  library storyboard. Asset thumbnails come back as "/media/…"; re-root them
   *  under the proxy so <img> loads them. */
  getReview: async (id: string): Promise<ReviewData> => {
    const rev = await request<ReviewData>(`/review/${encodeURIComponent(id)}`);
    return {
      ...rev,
      visuals: (rev.visuals ?? []).map((v) => ({
        ...v,
        thumbUrl: proxyMediaUrl(v.thumbUrl),
        candidates: (v.candidates ?? []).map((c) => ({ ...c, thumbUrl: proxyMediaUrl(c.thumbUrl) })),
      })),
    };
  },

  /** Swap the selected asset for a scene to a different candidate (local ref or remote url). */
  pickAsset: (preparedId: string, sceneId: string, ref: string) =>
    request<{ ok: boolean }>(`/prepared/${encodeURIComponent(preparedId)}/pick-asset`, {
      method: "PUT",
      body: JSON.stringify({ sceneId, ref }),
    }),

  /** FLUX-generate a still image for a scene and set it as the selected asset. */
  generateAsset: (preparedId: string, sceneId: string) =>
    request<{ ok: boolean; ref: string }>(`/prepared/${encodeURIComponent(preparedId)}/generate-asset`, {
      method: "POST",
      body: JSON.stringify({ sceneId }),
      timeoutMs: 90_000, // FLUX cold start can take 60s
    }),

  uploadAudio: async (name: string, bytes: ArrayBuffer) =>
    request<{ path: string }>(`/uploads?name=${encodeURIComponent(name)}`, {
      method: "POST",
      body: bytes,
      headers: { "content-type": "application/octet-stream" },
      timeoutMs: 120_000,
    }),

  outputUrl: (id: string) => `${BASE}/outputs/${encodeURIComponent(id)}.mp4`,
};

/**
 * Poll a job until it finishes or errors. Calls onTick with each fresh snapshot
 * so the UI can animate the progress bar. Resolves with the terminal (succeeded)
 * job, or throws ApiError on a failed job / transport error. Tolerates a few
 * transient blips while a job is live.
 */
export async function pollJob(
  id: string,
  onTick: (job: Job) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {}
): Promise<Job> {
  const interval = opts.intervalMs ?? 900;
  let misses = 0;
  while (true) {
    if (opts.signal?.aborted) throw new ApiError("Cancelled.", { offline: true });
    let job: Job;
    try {
      job = await api.getJob(id);
      misses = 0;
    } catch (err) {
      // Tolerate a few transient failures before giving up on a live job.
      if (err instanceof ApiError && err.offline && misses < 4) {
        misses++;
        await sleep(interval);
        continue;
      }
      throw err;
    }
    onTick(job);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new ApiError(job.error || "The pipeline reported an error.", { body: job });
    await sleep(interval);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
