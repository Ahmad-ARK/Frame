// App state for the review wizard. One store, no library: a screen pointer, the
// project being reviewed, and a toast queue. The wizard is Welcome → Library →
// New → Generate → (Script · Visuals · Captions gates) → Render → Done. The
// scene-type system is deliberately absent from this model — the UI never names
// it. Assets carry a plain `desc` + the script line they illustrate; that's all
// the reviewer sees.
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";

export type Screen = "welcome" | "library" | "new" | "generating" | "gate" | "render" | "done";
export type Gate = "script" | "visuals" | "captions";
export type ComposeMode = "script" | "topic" | "voice";

export interface Asset {
  id: string;
  desc: string;        // plain-language subject shown to the reviewer
  line: string;        // the narration line it appears under
  source: string;      // honest provenance note ("AI-generated", "Stock footage", …)
  flagged: boolean;    // surfaced for review (low vision-confidence)
  resolved: boolean;   // reviewer accepted / replaced it
  busy?: boolean;      // a try-another regen is in flight
  thumbUrl?: string;   // the real fetched/generated image (once prepared)
}

export interface Caption {
  id: string;
  t: string;           // mm:ss timestamp label
  text: string;
}

export interface Project {
  id: string;
  title: string;
  status: "draft" | "rendering" | "done";
  script: string;
  assets: Asset[];
  captions: Caption[];
  jobId?: string;
  outputUrl?: string;
  /** Set only when this film is backed by a real storyboard on the pipeline.
   *  Its presence is what lets the Render gate dispatch a real render job
   *  instead of a local preview. */
  serverStoryboardId?: string;
  /** For a topic-mode film, the topic the pipeline will write the script from. */
  topic?: string;
  /** How this film entered the wizard — drives which real job the Render gate
   *  dispatches (script→import, topic→generate, voice→upload+audio). Absent for
   *  library/sample films, which render their existing storyboard. */
  compose?: { mode: ComposeMode; audioFile?: File };

  // ── preparation: assets are fetched in a "prepare" job BEFORE review, so the
  // Visuals/Captions gates can show real data. preparedId backs the render. ──
  prepareJobId?: string;
  preparedId?: string;
  prepareState?: "running" | "ready" | "error";
  prepareStage?: string;
  prepareProgress?: number;
  prepareError?: string;
  preparedScript?: string; // the script that was sent to prepare (detect edits)
}

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  title: string;
  detail?: string;
}

interface State {
  screen: Screen;
  gate: Gate;
  prev: Screen | null;     // for directional transitions
  project: Project | null;
  toasts: Toast[];
}

type Action =
  | { type: "go"; screen: Screen }
  | { type: "gate"; gate: Gate }
  | { type: "setProject"; project: Project }
  | { type: "patchProject"; patch: Partial<Project> }
  | { type: "patchAsset"; id: string; patch: Partial<Asset> }
  | { type: "patchCaption"; id: string; text: string }
  | { type: "toast"; toast: Toast }
  | { type: "untoast"; id: number };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "go":
      return { ...s, prev: s.screen, screen: a.screen };
    case "gate":
      return { ...s, gate: a.gate };
    case "setProject":
      return { ...s, project: a.project };
    case "patchProject":
      return s.project ? { ...s, project: { ...s.project, ...a.patch } } : s;
    case "patchAsset":
      return s.project
        ? { ...s, project: { ...s.project, assets: s.project.assets.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) } }
        : s;
    case "patchCaption":
      return s.project
        ? { ...s, project: { ...s.project, captions: s.project.captions.map((c) => (c.id === a.id ? { ...c, text: a.text } : c)) } }
        : s;
    case "toast": {
      // Don't stack an identical toast that's already showing — guards against
      // double-fire (e.g. React StrictMode invoking an effect twice in dev).
      const dup = s.toasts.some(
        (t) => t.kind === a.toast.kind && t.title === a.toast.title && t.detail === a.toast.detail
      );
      return dup ? s : { ...s, toasts: [...s.toasts, a.toast] };
    }
    case "untoast":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    default:
      return s;
  }
}

interface Store {
  state: State;
  go: (screen: Screen) => void;
  setGate: (gate: Gate) => void;
  setProject: (project: Project) => void;
  patchProject: (patch: Partial<Project>) => void;
  patchAsset: (id: string, patch: Partial<Asset>) => void;
  patchCaption: (id: string, text: string) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    screen: "welcome",
    gate: "script",
    prev: null,
    project: null,
    toasts: [],
  });
  const tid = useRef(1);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = tid.current++;
    dispatch({ type: "toast", toast: { ...t, id } });
    // auto-dismiss non-errors; errors stay until clicked
    if (t.kind !== "error") setTimeout(() => dispatch({ type: "untoast", id }), 4200);
  }, []);

  const store = useMemo<Store>(
    () => ({
      state,
      go: (screen) => dispatch({ type: "go", screen }),
      setGate: (gate) => dispatch({ type: "gate", gate }),
      setProject: (project) => dispatch({ type: "setProject", project }),
      patchProject: (patch) => dispatch({ type: "patchProject", patch }),
      patchAsset: (id, patch) => dispatch({ type: "patchAsset", id, patch }),
      patchCaption: (id, text) => dispatch({ type: "patchCaption", id, text }),
      toast,
      dismiss: (id) => dispatch({ type: "untoast", id }),
    }),
    [state, toast]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}
