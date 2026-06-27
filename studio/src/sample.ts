// Representative review content used to drive the wizard before the live
// storyboard→UI mapping is wired (that parse — narration→script, vision-verified
// flag→which assets surface, wordTimings→captions — is the next backend step).
// The shape here matches what that mapping will emit, so screens won't change.
import type { ComposeMode, Project } from "./store";
import { captionsFromScript, titleFromScript } from "./derive";

let n = 0;
const uid = (p: string) => `${p}_${(++n).toString(36)}`;

/** The demo film (sample 1842 content) — used for the canned library examples. */
export function freshProject(title = "Untitled documentary"): Project {
  return {
    id: uid("proj"),
    title,
    status: "draft",
    script: SAMPLE_SCRIPT,
    assets: SAMPLE_ASSETS(),
    captions: SAMPLE_CAPTIONS(),
  };
}

/** An empty shell for a real film whose content loads from the server (/review). */
export function emptyProject(title = "Untitled documentary"): Project {
  return { id: uid("proj"), title, status: "draft", script: "", assets: [], captions: [] };
}

/**
 * Build a project from the user's actual compose input — NOT sample data. A
 * pasted script flows straight into the gates (script + derived captions);
 * topic/voice films carry their seed so the Render gate can dispatch the right
 * real pipeline job. Assets are intentionally empty: real footage/images are
 * sourced by the pipeline at render time, so the Visuals gate shows an honest
 * "nothing to review yet" rather than inventing thumbnails.
 */
export function projectFromCompose(mode: ComposeMode, text: string, audioFile?: File): Project {
  const base = { id: uid("proj"), status: "draft" as const, assets: [], compose: { mode, audioFile } };
  if (mode === "script") {
    const script = text.trim();
    return { ...base, title: titleFromScript(script), script, captions: captionsFromScript(script) };
  }
  if (mode === "topic") {
    const topic = text.trim();
    return { ...base, title: topic.slice(0, 60) || "Untitled documentary", script: "", captions: [], topic };
  }
  // voice
  return {
    ...base,
    title: audioFile?.name?.replace(/\.[^.]+$/, "") || "Your narration",
    script: "",
    captions: [],
  };
}

const SAMPLE_SCRIPT = `In the summer of 1842, a single ledger crossed the North Sea — and with it, the quiet arithmetic that would underwrite an empire.

The numbers were unremarkable. Tonnes of indigo, chests of tea, a column of debts owed in a currency few of the clerks had ever held. But arithmetic, once written down, has a way of becoming destiny.

Within a decade, the ledger's logic had redrawn the map. Ports that had traded for centuries found themselves bypassed; rivers were rerouted on paper long before a single channel was dug.

What follows is the story of how a balance sheet became a border — and of the people who lived, and were counted, on the wrong side of the line.`;

const SAMPLE_ASSETS = (): Project["assets"] => [
  {
    id: uid("a"),
    sceneId: "",
    desc: "A weathered shipping ledger, open to a column of figures",
    line: "a single ledger crossed the North Sea",
    source: "AI-generated · we couldn't verify a real 1842 ledger photo",
    flagged: true,
    resolved: false,
  },
  {
    id: uid("a"),
    sceneId: "",
    desc: "A 19th-century trade route drawn across a sea map",
    line: "the ledger's logic had redrawn the map",
    source: "AI-generated · closest stock image looked too modern",
    flagged: true,
    resolved: false,
  },
];

const SAMPLE_CAPTIONS = (): Project["captions"] => [
  { id: uid("c"), t: "0:00", text: "In the summer of 1842, a single ledger" },
  { id: uid("c"), t: "0:03", text: "crossed the North Sea — and with it," },
  { id: uid("c"), t: "0:06", text: "the quiet arithmetic that would" },
  { id: uid("c"), t: "0:08", text: "underwrite an empire." },
  { id: uid("c"), t: "0:11", text: "The numbers were unremarkable." },
  { id: uid("c"), t: "0:14", text: "Tonnes of indigo, chests of tea," },
  { id: uid("c"), t: "0:17", text: "a column of debts owed in a currency" },
  { id: uid("c"), t: "0:20", text: "few of the clerks had ever held." },
];

// How many assets the pipeline pulled in total, for the calm "all verified" line.
export const SAMPLE_TOTAL_ASSETS = 11;
