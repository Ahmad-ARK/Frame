import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconSpark, IconUpload } from "../../icons";
import { humanizeStage } from "../../stages";
import { useStore, type Asset, type AssetCandidate } from "../../store";
import { PreparingPane, ErrorPane } from "./PrepStates";
import { api } from "../../api";

// Gate ②. Shows every scene with its fetched asset. Each card has a row of
// alternative candidate thumbnails — user picks the best one, or clicks
// "Generate with AI" to get a FLUX-generated still. No more invisible verification.
export function Visuals({ onRetry }: { onRetry: () => void }) {
  const { state } = useStore();
  const project = state.project!;

  if (project.prepareState === "running") {
    return <PreparingPane title="Finding your visuals" stage={humanizeStage(project.prepareStage)} progress={project.prepareProgress ?? 0.05} />;
  }
  if (project.prepareState === "error") {
    return <ErrorPane message={project.prepareError} onRetry={onRetry} />;
  }

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
        <h2>Pick your visuals</h2>
        <p>We fetched a few options per scene. Click an alternative if the default doesn't look right, or generate one with AI.</p>
      </div>
      {project.assets.map((a) => <AssetCard key={a.id} asset={a} preparedId={project.preparedId} />)}
    </motion.div>
  );
}

function AssetCard({ asset, preparedId }: { asset: Asset; preparedId?: string }) {
  const { patchAsset, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedRef, setSelectedRef] = useState<string | undefined>(asset.thumbUrl);

  const pick = async (cand: AssetCandidate) => {
    if (!preparedId || !asset.sceneId) return;
    const ref = cand.ref ?? cand.url;
    if (!ref) return;
    patchAsset(asset.id, { busy: true });
    try {
      await api.pickAsset(preparedId, asset.sceneId, ref);
      // images resolve to a /media/ thumb; videos play straight from their URL.
      const newThumb = cand.thumbUrl ?? (cand.ref ? `/api/media/${cand.ref}` : cand.url);
      setSelectedRef(newThumb);
      patchAsset(asset.id, { busy: false, resolved: true, thumbUrl: newThumb, source: cand.source });
    } catch {
      patchAsset(asset.id, { busy: false });
      toast({ kind: "error", title: "Couldn't swap visual", detail: "Try again." });
    }
  };

  const generate = async () => {
    if (!preparedId || !asset.sceneId) return;
    patchAsset(asset.id, { busy: true });
    try {
      const { ref } = await api.generateAsset(preparedId, asset.sceneId);
      const newThumb = `/api/media/${ref}`;
      setSelectedRef(newThumb);
      patchAsset(asset.id, { busy: false, resolved: true, thumbUrl: newThumb, source: "AI-generated" });
      toast({ kind: "success", title: "AI visual ready", detail: asset.desc });
    } catch {
      patchAsset(asset.id, { busy: false });
      toast({ kind: "error", title: "Generation failed", detail: "Check FLUX credentials or try again." });
    }
  };

  const upload = (f?: File) => {
    if (!f) return;
    if (!/image|video/.test(f.type)) return toast({ kind: "error", title: "Unsupported file", detail: "Use an image or video clip." });
    const newThumb = URL.createObjectURL(f);
    setSelectedRef(newThumb);
    patchAsset(asset.id, { resolved: true, source: `Your upload · ${f.name}`, thumbUrl: newThumb });
    toast({ kind: "success", title: "Using your image", detail: f.name });
  };

  const candidates = asset.candidates ?? [];
  const hasCandidates = candidates.length > 1;
  const isVideoUrl = (u?: string) => !!u && (/\.(mp4|webm|mov)(\?|$)/i.test(u) || /archive\.org\/(download|serve)/i.test(u));
  const selectedIsVideo = isVideoUrl(selectedRef) || (candidates[0]?.kind === "video" && !asset.candidates?.some((c) => c.kind === "image"));

  return (
    <motion.div className="acard" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Main preview */}
      <div className="av">
        <div className="pic" style={selectedRef && !selectedIsVideo ? { backgroundImage: `url(${selectedRef})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {selectedRef && selectedIsVideo && (
            <video src={selectedRef} controls preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />
          )}
          {asset.busy && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(8,8,12,.55)", zIndex: 2 }}>
              <span className="spin" />
            </div>
          )}
          {!selectedRef && !asset.busy && (
            <span style={{ fontSize: 11, color: "var(--dim)", letterSpacing: "0.08em" }}>{selectedIsVideo ? "NO FOOTAGE" : "NO IMAGE"}</span>
          )}
        </div>
      </div>

      <div className="ab">
        <AnimatePresence mode="wait" initial={false}>
          {asset.resolved ? (
            <motion.span key="ok" className="flag ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              <IconCheck /> Looks right
            </motion.span>
          ) : (
            <motion.span key="pending" className="flag" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              Pick the best option
            </motion.span>
          )}
        </AnimatePresence>

        <div className="desc">{asset.desc}</div>
        <div className="ctx">"{asset.line}"</div>
        <div className="src">{asset.source}</div>

        {/* Candidate strip — click to swap. Videos show a first-frame poster. */}
        {hasCandidates && (
          <div className="cand-strip">
            {candidates.map((c, i) => {
              const isVid = c.kind === "video";
              const cThumb = c.thumbUrl ?? (c.ref ? `/api/media/${c.ref}` : isVid ? c.url : undefined);
              const isActive = cThumb === selectedRef || (i === 0 && !selectedRef);
              return (
                <button
                  key={i}
                  className={`cand-thumb${isActive ? " active" : ""}`}
                  title={c.caption ?? c.source}
                  disabled={asset.busy}
                  onClick={() => pick(c)}
                  style={cThumb && !isVid ? { backgroundImage: `url(${cThumb})` } : undefined}
                >
                  {isVid && cThumb && <video src={cThumb} preload="metadata" muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }} />}
                  {isVid && <span className="cand-play">▶</span>}
                  {!cThumb && !isVid && <span style={{ fontSize: 9, color: "var(--dim)" }}>?</span>}
                  {isActive && <span className="cand-check"><IconCheck /></span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="acts">
          <button className="abtn go" onClick={generate} disabled={asset.busy}>
            <IconSpark /> Generate with AI
          </button>
          <button className="abtn" onClick={() => fileRef.current?.click()} disabled={asset.busy}>
            <IconUpload /> Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
    </motion.div>
  );
}
