import { AnimatePresence, motion } from "framer-motion";
import { ErrorBoundary, Sidebar, ToastHost } from "./components/ui";
import { useStore, type Screen } from "./store";
import { Welcome } from "./screens/Welcome";
import { Library } from "./screens/Library";
import { New } from "./screens/New";
import { Generating } from "./screens/Generating";
import { Gate } from "./screens/Gate";
import { Render } from "./screens/Render";
import { Done } from "./screens/Done";

// Screens that take the whole viewport (a single focused moment, no chrome).
const FULL_BLEED: Screen[] = ["welcome", "generating", "render"];

const SCREENS: Record<Screen, () => JSX.Element> = {
  welcome: Welcome,
  library: Library,
  new: New,
  generating: Generating,
  gate: Gate,
  render: Render,
  done: Done,
};

export default function App() {
  const { state } = useStore();
  const screen = state.screen;
  const Active = SCREENS[screen];
  const fullBleed = FULL_BLEED.includes(screen);

  return (
    <ErrorBoundary>
      <div className="app" style={fullBleed ? { gridTemplateColumns: "1fr" } : undefined}>
        {!fullBleed && <Sidebar />}
        <main className="main" style={{ position: "relative" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              style={{ position: "absolute", inset: 0, overflow: screen === "gate" ? "hidden" : "auto" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 0.8, 0.28, 1] }}
            >
              <Active />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ToastHost />
    </ErrorBoundary>
  );
}
