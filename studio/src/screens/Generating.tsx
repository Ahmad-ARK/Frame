import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ring } from "../components/ui";
import { freshProject } from "../sample";
import { useStore } from "../store";

// The pipeline's internals (scene selection, vision verification, the prebuilt
// scene library) are the moat — so we narrate the wait in the reviewer's terms,
// never the system's. These are honest, plain-language phases, not scene types.
const PHASES = [
  "Reading your script",
  "Sourcing footage and images",
  "Composing the cut",
  "Timing the narration",
  "Preparing your review",
];

export function Generating() {
  const { go, setProject } = useStore();
  const [phase, setPhase] = useState(0);
  const [pct, setPct] = useState(0.02);
  const done = useRef(false);

  useEffect(() => {
    // Staged simulation of the hidden pipeline. (Live storyboard generation +
    // its content mapping is the next backend step; rendering, on the Render
    // screen, is already real.) Smooth, slightly eased, never stalls at 100.
    let raf = 0;
    const start = performance.now();
    const total = 5200; // ms
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setPct(0.02 + eased * 0.96);
      setPhase(Math.min(PHASES.length - 1, Math.floor(eased * PHASES.length)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (!done.current) {
        done.current = true;
        setProject(freshProject());
        setTimeout(() => go("gate"), 420);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, setProject]);

  return (
    <div className="screen" style={{ display: "grid", placeItems: "center" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        style={{ textAlign: "center", width: 360 }}
      >
        <Ring value={pct} label={`${Math.round(pct * 100)}%`} />
        <div style={{ height: 26, marginTop: 6 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              style={{ fontFamily: "var(--syne)", fontWeight: 600, fontSize: 18 }}
            >
              {PHASES[phase]}
            </motion.div>
          </AnimatePresence>
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 8, fontFamily: "var(--mono)" }}>
          This usually takes under a minute.
        </p>
      </motion.div>
    </div>
  );
}
