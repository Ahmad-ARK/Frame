import { motion } from "framer-motion";
import { Bezel } from "../components/Bezel";
import { Button } from "../components/ui";
import { IconDownload, IconGrid, IconPlay } from "../icons";
import { useStore } from "../store";

export function Done() {
  const { state, go, toast } = useStore();
  const project = state.project!;
  const url = project.outputUrl;
  // A closing still in the bezel: the film's last caption line, else its title.
  const previewCaption = project.captions[project.captions.length - 1]?.text || project.title;

  return (
    <div className="done-wrap">
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <div className="kicker">Render complete</div>
        <h2>{project.title} is ready.</h2>

        <motion.div
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 120, damping: 16 }}
          style={{ maxWidth: 620, margin: "0 auto", position: "relative" }}
        >
          <Bezel caption={<em>{previewCaption}</em>} />
          <button
            className="play-badge"
            onClick={() => (url ? window.open(url, "_blank") : toast({ kind: "info", title: "Local preview", detail: "Render with the pipeline running to play the real file." }))}
            aria-label="Play"
          >
            <IconPlay />
          </button>
        </motion.div>

        <div className="done-actions">
          {url ? (
            <a className="btn accent" href={url} download>
              <IconDownload /> Download film
            </a>
          ) : (
            <Button variant="accent" onClick={() => toast({ kind: "info", title: "Nothing to download yet", detail: "This was an offline preview." })}>
              <IconDownload /> Download film
            </Button>
          )}
          <Button variant="ghost" onClick={() => go("library")}><IconGrid /> Back to library</Button>
        </div>
      </motion.div>
    </div>
  );
}
