import { AnimatePresence, motion } from "framer-motion";
import { Stepper } from "../components/Stepper";
import { Button } from "../components/ui";
import { IconArrow, IconBack } from "../icons";
import { useStore, type Gate as GateKey } from "../store";
import { usePreparation } from "../usePrepare";
import { Script } from "./gates/Script";
import { Visuals } from "./gates/Visuals";
import { Captions } from "./gates/Captions";

const ORDER: GateKey[] = ["script", "visuals", "captions"];
const TITLES: Record<GateKey, { t: string; k: string }> = {
  script: { t: "Read the script", k: "Gate 1 · Script" },
  visuals: { t: "Check the visuals", k: "Gate 2 · Visuals" },
  captions: { t: "Review captions", k: "Gate 3 · Captions" },
};
const NEXT_LABEL: Record<GateKey, string> = {
  script: "Looks good — visuals",
  visuals: "Looks good — captions",
  captions: "Render film",
};

export function Gate() {
  const { state, setGate, go } = useStore();
  const { startPreparation, retryPreparation } = usePreparation();
  const project = state.project!;
  const gate = state.gate;
  const idx = ORDER.indexOf(gate);

  // Films that source assets from the pipeline (library storyboards + composed
  // films) must finish preparing before they can render.
  const needsPrepare = !!project.serverStoryboardId || !!project.compose;
  const ready = project.prepareState === "ready";

  const back = () => (idx === 0 ? go("library") : setGate(ORDER[idx - 1]));
  const next = () => {
    // Leaving Script kicks off preparation (fetch/voice/enrich/assets) for a
    // composed film, using the final edited script. Library films already
    // started preparing on open.
    if (gate === "script" && !project.serverStoryboardId) void startPreparation();
    if (gate === "captions") return go("render");
    setGate(ORDER[idx + 1]);
  };

  const renderBlocked = gate === "captions" && needsPrepare && !ready;
  const nextLabel =
    renderBlocked && project.prepareState !== "error" ? "Preparing…" : NEXT_LABEL[gate];

  return (
    <div className="gate">
      <div className="gbar">
        <div className="ttl">
          {TITLES[gate].t}
          <small>{TITLES[gate].k}</small>
        </div>
        <Stepper active={gate} onJump={setGate} />
        <div className="gacts">
          <Button size="sm" variant="ghost" onClick={back}><IconBack /> Back</Button>
          <Button size="sm" variant="accent" onClick={next} disabled={renderBlocked}>
            {nextLabel} <IconArrow />
          </Button>
        </div>
      </div>

      <div className="gbody">
        <AnimatePresence mode="wait">
          <motion.div key={gate} style={{ height: "100%" }}>
            {gate === "script" && <Script onRetry={retryPreparation} />}
            {gate === "visuals" && <Visuals onRetry={retryPreparation} />}
            {gate === "captions" && <Captions onRetry={retryPreparation} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
