import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, type Job } from "../api";
import { IconCheck, IconDownload, IconPlay, IconWarn } from "../icons";
import { humanizeStage } from "../stages";

// Live view of the server's job queue. Films render in the background (the worker
// processes one at a time), so this polls GET /jobs and groups them: In progress
// (queued/running, with the current stage + progress) and Ready (succeeded,
// playable/downloadable). The user can start a film, leave, make another, and
// watch them move from one section to the other here.
export function JobsPanel() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const js = await api.listJobs();
        if (alive) setJobs(js);
      } catch {
        /* offline — the Library already surfaces that; just keep the last view */
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  if (!jobs || jobs.length === 0) return null;

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const ready = jobs.filter((j) => j.status === "succeeded");
  const failed = jobs.filter((j) => j.status === "failed");

  return (
    <div className="jobs">
      {active.length > 0 && (
        <Section title="In progress" hint={`${active.length} rendering`}>
          <AnimatePresence initial={false}>
            {active.map((j) => <ActiveRow key={j.id} job={j} />)}
          </AnimatePresence>
        </Section>
      )}
      {ready.length > 0 && (
        <Section title="Ready to watch" hint={`${ready.length} done`}>
          {ready.map((j) => <ReadyRow key={j.id} job={j} />)}
        </Section>
      )}
      {failed.length > 0 && (
        <Section title="Needs attention">
          {failed.map((j) => <FailedRow key={j.id} job={j} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="jobs-sec">
      <div className="jobs-sec-head">
        <span>{title}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="jobs-list">{children}</div>
    </div>
  );
}

function ActiveRow({ job }: { job: Job }) {
  const pct = Math.round((job.progress ?? 0.02) * 100);
  return (
    <motion.div
      className="job-row"
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
    >
      <span className="spin" />
      <div className="job-main">
        <div className="job-title">{job.label || "Untitled documentary"}</div>
        <div className="job-bar"><motion.div animate={{ width: `${Math.max(4, pct)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} /></div>
      </div>
      <div className="job-side">
        <div className="job-stage">{job.status === "queued" ? "Queued" : humanizeStage(job.stage)}</div>
        <div className="job-pct">{pct}%</div>
      </div>
    </motion.div>
  );
}

function ReadyRow({ job }: { job: Job }) {
  return (
    <div className="job-row">
      <span className="job-dot ok"><IconCheck /></span>
      <div className="job-main"><div className="job-title">{job.label || "Untitled documentary"}</div></div>
      <div className="job-actions">
        {job.outputUrl && (
          <>
            <a className="abtn go" href={job.outputUrl} target="_blank" rel="noreferrer"><IconPlay /> Watch</a>
            <a className="abtn" href={job.outputUrl} download><IconDownload /> Save</a>
          </>
        )}
      </div>
    </div>
  );
}

function FailedRow({ job }: { job: Job }) {
  return (
    <div className="job-row">
      <span className="job-dot err"><IconWarn /></span>
      <div className="job-main">
        <div className="job-title">{job.label || "Untitled documentary"}</div>
        <div className="job-err">{job.error || "Something went wrong."}</div>
      </div>
    </div>
  );
}
