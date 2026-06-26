import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconShuffle, IconSpark, IconUpload, IconWarn } from "../../icons";
import { humanizeStage } from "../../stages";
import { useStore, type Asset } from "../../store";
import { PreparingPane, ErrorPane } from "./PrepStates";

// Gate ②. By the time the reviewer arrives, the pipeline has fetched real footage
// and images (the "prepare" phase). Low-confidence (AI-generated) assets surface
// as cards with the real thumbnail; everything verified collapses into one calm
// line. While preparing, it shows live progress; on failure, a retry.
export function Visuals({ onRetry }: { onRetry: () => void }) {
  const { state } = useStore();
  const project = state.project!;

  if (project.prepareState === "running") {
    return <PreparingPane title="Finding your visuals" stage={humanizeStage(project.prepareStage)} progress={project.prepareProgress ?? 0.05} />;
  }
  if (project.prepareState === "error") {
    return <ErrorPane message={project.prepareError} onRetry={onRetry} />;
  }

  const flagged = project.assets.filter((a) => a.flagged);
  const verifiedCount = project.assets.length - flagged.length;
  const unresolved = flagged.filter((a) => !a.resolved).length;

  if (project.assets.length === 0) {
    return (
      <motion.div className="vis-wrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="vis-head">
          <h2>No images to review</h2>
          <p>This film is built from motion graphics — maps, timelines and titles — so there's no footage to check. Continue to captions.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="vis-wrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="vis-head">
        <h2>{flagged.length > 0 ? "A few visuals to check" : "Your visuals are ready"}</h2>
        <p>
          {flagged.length === 0 ? (
            <>Every image was matched and verified — nothing needs your eye.</>
          ) : unresolved > 0 ? (
            <>We weren't fully sure about <b>{unresolved}</b> of them. Everything else looked right.</>
          ) : (
            <>All set — thanks for confirming.</>
          )}
        </p>
      </div>

      {flagged.map((a) => <AssetCard key={a.id} asset={a} />)}

      {verifiedCount > 0 && (
        <div className="verified-note">
          <span className="ck"><IconCheck /></span>
          <span><b style={{ color: "var(--ink)" }}>{verifiedCount} {verifiedCount === 1 ? "visual was" : "visuals were"} matched and verified</b> — no action needed.</span>
        </div>
      )}
    </motion.div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const { patchAsset, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const regen = () => {
    if (asset.busy) return;
    patchAsset(asset.id, { busy: true });
    // Stand-in for a real per-asset re-fetch; on a live build this dispatches a
    // single-scene regenerate and swaps the thumbnail when it returns.
    setTimeout(() => {
      patchAsset(asset.id, { busy: false, resolved: true, source: "AI-generated · new take" });
      toast({ kind: "success", title: "New visual ready", detail: asset.desc });
    }, 1600);
  };

  const upload = (f?: File) => {
    if (!f) return;
    if (!/image|video/.test(f.type)) return toast({ kind: "error", title: "Unsupported file", detail: "Use an image or video clip." });
    patchAsset(asset.id, { resolved: true, source: `Your upload · ${f.name}`, thumbUrl: URL.createObjectURL(f) });
    toast({ kind: "success", title: "Using your image", detail: f.name });
  };

  return (
    <motion.div className="acard" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="av">
        <div className="pic" style={asset.thumbUrl ? { backgroundImage: `url(${asset.thumbUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {asset.busy && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(8,8,12,.55)", zIndex: 2 }}>
              <span className="spin" />
            </div>
          )}
        </div>
      </div>

      <div className="ab">
        <AnimatePresence mode="wait" initial={false}>
          {asset.resolved ? (
            <motion.span key="ok" className="flag ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              <IconCheck /> Looks right now
            </motion.span>
          ) : (
            <motion.span key="warn" className="flag" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              <IconWarn /> Worth a look
            </motion.span>
          )}
        </AnimatePresence>

        <div className="desc">{asset.desc}</div>
        <div className="ctx">appears under "<em>{asset.line}</em>"</div>
        <div className="src">{asset.source}</div>

        <div className="acts">
          <button className="abtn go" onClick={regen} disabled={asset.busy}>
            <IconShuffle /> Try another
          </button>
          <button className="abtn" onClick={() => fileRef.current?.click()} disabled={asset.busy}>
            <IconUpload /> Upload
          </button>
          <button className="abtn" onClick={regen} disabled={asset.busy}>
            <IconSpark /> Describe it
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
    </motion.div>
  );
}
