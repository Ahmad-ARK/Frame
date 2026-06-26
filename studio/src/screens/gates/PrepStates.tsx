// Shared "still preparing" / "preparation failed" panes for the gates that need
// the pipeline to finish fetching before they have anything real to show.
import { motion } from "framer-motion";
import { IconWarn } from "../../icons";

export function PreparingPane({ title, stage, progress }: { title: string; stage: string; progress: number }) {
  return (
    <div className="prep-pane">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        style={{ textAlign: "center", width: 360 }}
      >
        <span className="spin" style={{ width: 26, height: 26, margin: "0 auto 18px", display: "block" }} />
        <div style={{ fontFamily: "var(--syne)", fontWeight: 600, fontSize: 18 }}>{title}</div>
        <div style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 6 }}>{stage}</div>
        <div className="pbar" style={{ marginTop: 16 }}>
          <motion.div initial={false} animate={{ width: `${Math.round(Math.max(0.05, progress) * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
        </div>
        <div style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12, marginTop: 10 }}>
          You can wait here — this usually takes under two minutes.
        </div>
      </motion.div>
    </div>
  );
}

export function ErrorPane({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="prep-pane">
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <IconWarn style={{ width: 32, height: 32, color: "var(--red)" }} />
        <div style={{ fontFamily: "var(--syne)", fontWeight: 700, fontSize: 20, marginTop: 14 }}>Couldn't prepare your film</div>
        <p style={{ color: "var(--ink-2)", marginTop: 8 }}>{message || "Something went wrong while sourcing footage."}</p>
        <button className="btn accent sm" style={{ marginTop: 18 }} onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}
