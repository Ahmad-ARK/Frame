// Drives "preparation": fetching the real assets/captions BEFORE the user reviews
// them. Two paths converge here:
//   • Library storyboard — already prepared; just GET /review.
//   • Compose film — dispatch a `prepare` job (script→voice→enrich→assets), poll
//     it, then GET /review of the prepared storyboard.
// In both cases the result is applied into the project so the Visuals/Captions
// gates render real data. A ref guards against double-runs (StrictMode / re-entry)
// and we deliberately never abort: a prepare job should keep running server-side
// even if the user navigates away.
import { useCallback, useEffect, useRef } from "react";
import { api, ApiError, pollJob, type ReviewData } from "./api";
import { useStore, type Project } from "./store";

async function dispatchPrepare(p: Project): Promise<string> {
  const c = p.compose;
  // The project id is stable across retries → the backend resumes a failed
  // prepare from its last completed step instead of re-running from scratch.
  const filmId = p.id;
  if (c?.mode === "voice" && c.audioFile) {
    const bytes = await c.audioFile.arrayBuffer();
    const { path } = await api.uploadAudio(c.audioFile.name, bytes);
    const { id } = await api.createJob("prepare", {
      filmId,
      audioPath: path,
      topic: p.title,
      ...(p.script.trim() ? { script: p.script } : {}),
    });
    return id;
  }
  if (c?.mode === "topic" && p.topic) {
    const { id } = await api.createJob("prepare", { filmId, topic: p.topic });
    return id;
  }
  // script (default)
  const { id } = await api.createJob("prepare", { filmId, script: p.script, topic: p.title });
  return id;
}

export function usePreparation() {
  const { state, patchProject } = useStore();
  // Read the live project from a ref so the callbacks stay stable.
  const projectRef = useRef<Project | null>(state.project);
  projectRef.current = state.project;
  const running = useRef(false);

  const applyReview = useCallback(
    (rev: ReviewData, preparedId?: string) => {
      patchProject({
        ...(rev.script ? { script: rev.script } : {}),
        assets: rev.visuals.map((v) => ({
          id: v.id, desc: v.desc, line: v.line, source: v.source,
          flagged: v.flagged, resolved: false, thumbUrl: v.thumbUrl,
        })),
        captions: rev.captions.map((c) => ({ id: c.id, t: c.t, text: c.text })),
        ...(preparedId ? { preparedId } : {}),
        prepareState: "ready",
      });
    },
    [patchProject]
  );

  const startPreparation = useCallback(async () => {
    if (running.current) return;
    const p = projectRef.current;
    if (!p) return;
    running.current = true;
    patchProject({ prepareState: "running", prepareError: undefined });
    try {
      if (p.serverStoryboardId) {
        applyReview(await api.getReview(p.serverStoryboardId));
      } else {
        let jobId = p.prepareJobId;
        if (!jobId || p.preparedScript !== p.script) {
          jobId = await dispatchPrepare(p);
          patchProject({ prepareJobId: jobId, preparedScript: p.script });
        }
        const job = await pollJob(jobId, (j) => patchProject({ prepareStage: j.stage, prepareProgress: j.progress }));
        if (!job.preparedId) throw new ApiError("Preparation finished without producing a film.");
        applyReview(await api.getReview(job.preparedId), job.preparedId);
      }
    } catch (err) {
      patchProject({ prepareState: "error", prepareError: (err as ApiError)?.message ?? "Preparation failed." });
    } finally {
      running.current = false;
    }
  }, [patchProject, applyReview]);

  // Retry after a failure: drop any failed job so a fresh one is dispatched.
  const retryPreparation = useCallback(() => {
    if (projectRef.current) projectRef.current = { ...projectRef.current, prepareJobId: undefined, preparedScript: undefined };
    patchProject({ prepareJobId: undefined, preparedScript: undefined, prepareState: undefined, prepareError: undefined });
    void startPreparation();
  }, [patchProject, startPreparation]);

  // Library storyboards are already prepared — load their review on open.
  useEffect(() => {
    const p = state.project;
    if (p?.serverStoryboardId && !p.preparedId && p.prepareState === undefined) {
      void startPreparation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.project?.serverStoryboardId]);

  return { startPreparation, retryPreparation };
}
