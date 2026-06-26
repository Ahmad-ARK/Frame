import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../components/ui";
import { IconCheck } from "../../icons";
import { humanizeStage } from "../../stages";
import { useStore } from "../../store";
import { PreparingPane, ErrorPane } from "./PrepStates";

// Gate ①. The narration as readable prose — the reviewer reads and lightly edits
// it like a document. No JSON, no scene markup; that lives under the surface.
export function Script({ onRetry }: { onRetry: () => void }) {
  const { state, patchProject } = useStore();
  const project = state.project!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.script);

  const hasScript = project.script.trim().length > 0;

  // A library film loads its script from the server; show the load state until
  // it arrives. (Composed films already have the pasted script here.)
  if (!hasScript && project.prepareState === "running") {
    return <PreparingPane title="Loading the script" stage={humanizeStage(project.prepareStage)} progress={project.prepareProgress ?? 0.1} />;
  }
  if (!hasScript && project.prepareState === "error") {
    return <ErrorPane message={project.prepareError} onRetry={onRetry} />;
  }
  const words = project.script.trim().split(/\s+/).filter(Boolean).length;
  const secs = Math.round((words / 150) * 60); // ~150 wpm narration
  const dur = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  // Topic/voice films have no script yet — it's written/transcribed at render.
  const pending =
    project.compose?.mode === "topic"
      ? "We'll write the narration from your topic when you render. You'll be able to edit it then."
      : "Your recording will be transcribed and timed when you render. The transcript appears here afterwards.";

  return (
    <motion.div
      className="script-wrap"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <div className="script-top">
        <div className="kicker">Your narration</div>
        {hasScript &&
          (editing ? (
            <Button size="sm" variant="accent" onClick={() => { patchProject({ script: draft }); setEditing(false); }}>
              <IconCheck /> Save
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => { setDraft(project.script); setEditing(true); }}>
              Edit
            </Button>
          ))}
      </div>

      {hasScript ? (
        <>
          <div className="doc">
            {editing ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            ) : (
              project.script.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)
            )}
          </div>
          <div className="script-foot">
            <span>{words} words</span>
            <span>≈ {dur} runtime</span>
          </div>
        </>
      ) : (
        <div className="doc" style={{ color: "var(--ink-3)", fontSize: 17 }}>
          <p>{pending}</p>
        </div>
      )}
    </motion.div>
  );
}
