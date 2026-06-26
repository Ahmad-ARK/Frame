import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError, type StoryboardSummary } from "../api";
import { Button, Skeleton } from "../components/ui";
import { IconPlus } from "../icons";
import { emptyProject, freshProject } from "../sample";
import { useStore } from "../store";
import { JobsPanel } from "./JobsPanel";

type Card = { id: string; title: string; status: "done" | "draft" | "rendering"; sub: string; real?: boolean };

// Shown when the pipeline isn't reachable so the library still reads as a real
// workspace rather than an error wall. Clearly local placeholders.
const EXAMPLES: Card[] = [
  { id: "ex1", title: "The Ledger That Drew a Border", status: "done", sub: "4 min · 14 scenes" },
  { id: "ex2", title: "Salt Roads of the Sahel", status: "draft", sub: "draft · 9 scenes" },
];

const grid = { animate: { transition: { staggerChildren: 0.05 } } };
const pop = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 140, damping: 18 } },
};

export function Library() {
  const { go, setProject, toast } = useStore();
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listStoryboards()
      .then((sbs: StoryboardSummary[]) => {
        if (!alive) return;
        if (!sbs.length) return setCards(EXAMPLES);
        setCards(
          sbs.map((s) => ({
            id: s.id,
            title: s.title || "Untitled documentary",
            status: "draft" as const,
            sub: "Ready to render",
            real: true,
          }))
        );
      })
      .catch((err: ApiError) => {
        if (!alive) return;
        setCards(EXAMPLES);
        const detail = err.offline
          ? "The pipeline isn't running — start it to see your films."
          : err.message;
        toast({ kind: "info", title: "Showing examples", detail });
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const openNew = () => {
    setProject(freshProject());
    go("new");
  };

  return (
    <div className="lib">
      <div className="lib-head">
        <div>
          <h2>Library</h2>
          <p>Your documentaries, drafts and renders.</p>
        </div>
        <Button variant="accent" size="sm" onClick={openNew}><IconPlus /> New film</Button>
      </div>

      {/* Live render queue — films process in the background and move from
          "In progress" to "Ready to watch" here. */}
      <JobsPanel />

      <div className="lib-subhead">Start from a storyboard</div>
      <motion.div className="grid" variants={grid} initial="initial" animate="animate">
        <motion.button variants={pop} className="newcard" onClick={openNew}>
          <span className="pl"><IconPlus /></span>
          Start a new film
        </motion.button>

        {cards === null
          ? [0, 1, 2].map((i) => (
              <div key={i} className="proj">
                <Skeleton h={0} style={{ aspectRatio: "16/9", height: "auto" }} />
                <div style={{ padding: "14px 4px 0" }}><Skeleton h={14} w="60%" /></div>
              </div>
            ))
          : cards.map((c) => (
              <motion.div
                key={c.id}
                variants={pop}
                className="proj"
                onClick={() => {
                  // Real storyboards load their actual script/visuals/captions via
                  // the prepare/review path (the gate fetches /review on open), so
                  // open them empty rather than seeding the sample. Example cards
                  // (no real id) fall back to the demo content.
                  setProject(
                    c.real
                      ? { ...emptyProject(c.title), status: c.status, serverStoryboardId: c.id }
                      : { ...freshProject(c.title), status: c.status }
                  );
                  go("gate");
                }}
              >
                <div className="pv">
                  <div className="scn-globe" /><div className="scn-afg" /><div className="scn-scan" />
                </div>
                <div className="pmeta">
                  <div>
                    <h3>{c.title}</h3>
                    <div className="sub">{c.sub}</div>
                  </div>
                  <span className={`tagm ${c.status === "done" ? "done" : c.status === "rendering" ? "rend" : "draft"}`}>
                    {c.status}
                  </span>
                </div>
              </motion.div>
            ))}
      </motion.div>
    </div>
  );
}
