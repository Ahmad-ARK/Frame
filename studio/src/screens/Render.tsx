import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, ApiError, pollJob } from "../api";
import { Button } from "../components/ui";
import { IconArrow, IconBack, IconWarn } from "../icons";
import { humanizeStage } from "../stages";
import { useStore } from "../store";

// Gate ④, and the one place the pipeline does real work in-browser: it dispatches
// a render job and polls it to completion, surfacing live stage + progress. If
// the pipeline is unreachable it falls back to a clearly-labeled local preview so
// the flow is still walkable; a *real* mid-render failure shows a retry panel.
export function Render() {
  const { state, patchProject, go, toast } = useStore();
  const project = state.project!;
  const [pct, setPct] = useState(0.01);
  const [stage, setStage] = useState("Queued");
  const [err, setErr] = useState<string | null>(null);
  // True once a real server job is running — only then can it continue in the
  // background (a local/offline preview has no server job to keep going).
  const [backgroundable, setBackgroundable] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  // The heavy work (voice/enrich/assets) already happened in the Prepare phase
  // during review, so Render just renders the prepared storyboard:
  //   composed film     → render the reviewed storyboard (preparedId)
  //   library storyboard → render the existing storyboard (storyboardId)
  // Returns the job id, or null when there's nothing renderable (→ local preview).
  const dispatch = async (): Promise<string | null> => {
    if (project.preparedId) {
      const { id } = await api.createJob("render", { preparedId: project.preparedId, captionStyle: "karaoke" });
      return id;
    }
    if (project.serverStoryboardId) {
      const { id } = await api.createJob("render", { storyboardId: project.serverStoryboardId, captionStyle: "karaoke" });
      return id;
    }
    return null;
  };

  const finishPreview = async (ctrl: AbortController, title: string, detail: string) => {
    toast({ kind: "info", title, detail });
    await simulate(setPct, setStage, ctrl.signal);
    if (!ctrl.signal.aborted) {
      patchProject({ status: "done" });
      go("done");
    }
  };

  const run = async () => {
    setErr(null);
    setPct(0.01);
    setStage("Queued");
    setBackgroundable(false);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;

    try {
      const id = await dispatch();
      if (!id) {
        // Nothing concrete to render (e.g. an empty draft) — walkable local preview.
        return finishPreview(ctrl, "Preview render", "Add a script, topic, or recording to render the real file.");
      }
      setBackgroundable(true); // a real server job exists; it'll keep running if we leave
      patchProject({ jobId: id, status: "rendering" });
      const job = await pollJob(
        id,
        (j) => {
          if (typeof j.progress === "number") setPct(Math.max(0.02, j.progress));
          if (j.stage) setStage(humanizeStage(j.stage));
        },
        { signal: ctrl.signal }
      );
      patchProject({ status: "done", jobId: id, outputUrl: job.outputUrl || api.outputUrl(id) });
      setPct(1);
      setTimeout(() => go("done"), 400);
    } catch (e) {
      const apiErr = e as ApiError;
      if (apiErr.offline) {
        // Pipeline unreachable — give a walkable local preview, but say so.
        return finishPreview(ctrl, "Offline preview", "Start the pipeline to render for real.");
      }
      setErr(apiErr.message);
      toast({ kind: "error", title: "Render failed", detail: apiErr.message });
    }
  };

  useEffect(() => {
    // StrictMode invokes effects twice in dev. Without this guard, run() fires
    // twice → two jobs dispatched, and the first attempt gets aborted by the
    // StrictMode cleanup (→ a spurious "Offline preview" toast) while the second
    // shows the real result. Run exactly once. We deliberately don't abort on
    // unmount: a real server job keeps rendering in the background (that's the
    // "Continue in background" feature), and poll updates after unmount are
    // no-ops. The retry button aborts the prior attempt itself.
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="veil">
        <div className="sheet">
          <AnimatePresence mode="wait">
            {err ? (
              <motion.div key="err" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <IconWarn style={{ width: 34, height: 34, color: "var(--red)" }} />
                <h3>The render stopped</h3>
                <div className="now">{err}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => go("gate")}><IconBack /> Back to review</Button>
                  <Button size="sm" variant="accent" onClick={run}>Try again <IconArrow /></Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h3>Rendering your film</h3>
                <div className="now">{stage}</div>
                <div className="pbar">
                  <motion.div
                    initial={false}
                    animate={{ width: `${Math.round(pct * 100)}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                  />
                </div>
                <div className="pmeta2">
                  <span>{Math.round(pct * 100)}%</span>
                  <span>{project.title}</span>
                </div>
                {backgroundable && (
                  <div style={{ marginTop: 18 }}>
                    <Button size="sm" variant="ghost" onClick={() => go("library")}>
                      Continue in background <IconArrow />
                    </Button>
                    <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 8 }}>
                      Keeps rendering while you start another film.
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

async function simulate(
  setPct: (n: number) => void,
  setStage: (s: string) => void,
  signal: AbortSignal
) {
  const stages = ["Timing the narration", "Placing footage and images", "Composing scenes", "Rendering frames", "Encoding video"];
  const start = performance.now();
  const total = 4200;
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (signal.aborted) return resolve();
      const t = Math.min(1, (now - start) / total);
      setPct(Math.max(0.02, 1 - Math.pow(1 - t, 2)));
      setStage(stages[Math.min(stages.length - 1, Math.floor(t * stages.length))]);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
