import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "../components/ui";
import { IconArrow, IconMic, IconScript, IconTopic, IconUpload } from "../icons";
import { projectFromCompose } from "../sample";
import { useStore, type ComposeMode } from "../store";

const MODES: { key: ComposeMode; icon: JSX.Element; title: string; sub: string }[] = [
  { key: "script", icon: <IconScript />, title: "Bring a script", sub: "Paste your narration" },
  { key: "topic", icon: <IconTopic />, title: "Give a topic", sub: "We'll write it" },
  { key: "voice", icon: <IconMic />, title: "Your own voice", sub: "Upload narration" },
];

export function New() {
  const { go, setGate, setProject, toast } = useStore();
  const [mode, setMode] = useState<ComposeMode>("script");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const placeholder =
    mode === "script"
      ? "Paste your narration here. Write it as you'd say it aloud — Frame turns each line into a scene."
      : "Describe the documentary you want. A subject, an angle, roughly how long. The more specific, the better the first cut.";

  const ready = mode === "voice" ? !!file : text.trim().length > 12;

  const MAX_AUDIO_BYTES = 200_000_000; // keep in step with the server's upload cap
  const MAX_SCRIPT_CHARS = 60_000;

  const onPick = (f: File | undefined) => {
    if (!f) return;
    if (!/audio|video/.test(f.type) && !/\.(mp3|wav|m4a|mp4)$/i.test(f.name)) {
      return toast({ kind: "error", title: "Unsupported file", detail: "Upload an audio file (mp3, wav, m4a)." });
    }
    if (f.size > MAX_AUDIO_BYTES) {
      return toast({ kind: "error", title: "File too large", detail: "Audio must be under 200 MB." });
    }
    setFile(f);
  };

  // Build the project from the ACTUAL input and go straight to review. A pasted
  // script is shown as-is in the Script gate; topic/voice carry their seed for
  // the Render gate to dispatch the matching pipeline job. No sample data, and no
  // "generating" fiction — there's nothing to generate until the user renders.
  const start = () => {
    const project = projectFromCompose(mode, text, file ?? undefined);
    setProject(project);
    setGate("script");
    go("gate");
  };

  return (
    <div className="compose">
      <div className="kicker">New film · Step 1 of 2</div>
      <h2>Where should we start?</h2>

      <div className="modes">
        {MODES.map((m) => (
          <button key={m.key} className={`mode${mode === m.key ? " on" : ""}`} onClick={() => setMode(m.key)}>
            <span className="icn">{m.icon}</span>
            <b>{m.title}</b>
            <small>{m.sub}</small>
          </button>
        ))}
      </div>

      <div className="composer">
        <AnimatePresence mode="wait">
          {mode === "voice" ? (
            <motion.div
              key="drop"
              className="drop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPick(e.dataTransfer.files[0]);
              }}
            >
              <span className="ring"><IconUpload /></span>
              {file ? <b style={{ fontWeight: 600 }}>{file.name}</b> : <>Drop your narration audio, or click to choose</>}
              <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a" hidden onChange={(e) => onPick(e.target.files?.[0])} />
            </motion.div>
          ) : (
            <motion.textarea
              key="ta"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              placeholder={placeholder}
              value={text}
              maxLength={MAX_SCRIPT_CHARS}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          )}
        </AnimatePresence>
      </div>

      <div className="cbar">
        <span className="hint">
          {mode === "voice" ? "We'll transcribe and time every word." : `${text.trim().split(/\s+/).filter(Boolean).length} words`}
        </span>
        <Button variant="accent" disabled={!ready} onClick={start}>
          {mode === "script" ? "Review script" : "Continue"} <IconArrow />
        </Button>
      </div>
    </div>
  );
}
