// In-memory job store + queue. FIRST-SLICE scaffold: jobs live in a Map and a
// single in-process worker drains a FIFO queue. PRODUCTION SWAP: replace the Map
// with Postgres and the queue with BullMQ/Redis + separate worker processes — the
// `JobStore` shape below is the seam for that.

import { randomUUID } from "node:crypto";

export type JobMode = "render" | "import" | "generate" | "audio" | "prepare";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  mode: JobMode;
  status: JobStatus;
  stage?: string; // human label for the current step
  progress: number; // 0..1
  input: Record<string, unknown>;
  label?: string; // human name for the film (for the jobs dashboard)
  preparedId?: string; // storyboard id once a prepare job finishes (for review + render)
  outputUrl?: string;
  error?: string;
  owner?: string; // which API key created it (multi-tenant seam)
  createdAt: string;
  updatedAt: string;
};

export type JobPatch = Partial<Pick<Job, "status" | "stage" | "progress" | "outputUrl" | "error" | "preparedId">>;

export class JobStore {
  private jobs = new Map<string, Job>();
  private queue: string[] = [];

  create(mode: JobMode, input: Record<string, unknown>, owner?: string, label?: string): Job {
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), mode, status: "queued", progress: 0, input, label, owner, createdAt: now, updatedAt: now };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(owner?: string): Job[] {
    const all = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return owner ? all.filter((j) => j.owner === owner) : all;
  }

  patch(id: string, p: JobPatch): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, p, { updatedAt: new Date().toISOString() });
    return job;
  }

  /** Pull the next queued job id (FIFO), or undefined if the queue is empty. */
  dequeue(): string | undefined {
    return this.queue.shift();
  }
}
