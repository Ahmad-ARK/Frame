import { useState } from "react";
import { motion } from "framer-motion";
import { Bezel } from "../../components/Bezel";
import { humanizeStage } from "../../stages";
import { useStore } from "../../store";
import { PreparingPane, ErrorPane } from "./PrepStates";

// Gate ③. The video in its monitor frame, beside the caption transcript. Click
// any line to fix wording; the timestamps come from word-level alignment, so the
// reviewer only ever touches text, never timing.
export function Captions({ onRetry }: { onRetry: () => void }) {
  const { state, patchCaption } = useStore();
  const project = state.project!;
  const [active, setActive] = useState(project.captions[3]?.id ?? project.captions[0]?.id);
  const [editing, setEditing] = useState<string | null>(null);

  if (project.prepareState === "running") {
    return <PreparingPane title="Timing your captions" stage={humanizeStage(project.prepareStage)} progress={project.prepareProgress ?? 0.05} />;
  }
  if (project.prepareState === "error") {
    return <ErrorPane message={project.prepareError} onRetry={onRetry} />;
  }

  // Films with no word timings yet (e.g. an un-voiced library fixture).
  if (project.captions.length === 0) {
    return (
      <motion.div
        className="vis-wrap"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        <div className="vis-head">
          <h2>Captions come from your narration</h2>
          <p>Once your film is voiced, every word is timed precisely and the editable transcript appears here.</p>
        </div>
      </motion.div>
    );
  }

  const activeText = project.captions.find((c) => c.id === active)?.text ?? project.captions[0]?.text ?? "";

  return (
    <motion.div
      className="prev-wrap"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <div>
        <Bezel caption={<em>{activeText}</em>} />
        <div className="tline">
          <div className="tk"><div /></div>
          <div className="tr"><span>preview</span><span>final timing set at render</span></div>
        </div>
      </div>

      <div className="caps">
        <h3>Captions</h3>
        <div className="csub">Double-click a line to fix the wording. Exact timing is set from the voice at render.</div>
        <div className="cap-list">
          {project.captions.map((c) => {
            const on = c.id === active;
            return (
              <div
                key={c.id}
                className={`cap-line${on ? " on" : ""}`}
                onClick={() => setActive(c.id)}
                onDoubleClick={() => setEditing(c.id)}
              >
                <span className="tm">{c.t}</span>
                {editing === c.id ? (
                  <input
                    autoFocus
                    defaultValue={c.text}
                    onBlur={(e) => { patchCaption(c.id, e.target.value); setEditing(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { patchCaption(c.id, (e.target as HTMLInputElement).value); setEditing(null); }
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  c.text
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
