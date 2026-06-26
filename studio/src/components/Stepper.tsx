// The four-stop review path. Order is fixed; you can step back to a finished gate
// but not skip ahead past unreviewed work. A finished gate shows a check; the
// active one is highlighted. This is the only "where am I" affordance — the
// wizard otherwise keeps one focus per screen.
import { IconCheck } from "../icons";
import type { Gate } from "../store";

const ORDER: { key: Gate | "render"; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "visuals", label: "Visuals" },
  { key: "captions", label: "Captions" },
  { key: "render", label: "Render" },
];

export function Stepper({
  active,
  onJump,
}: {
  active: Gate | "render";
  onJump?: (g: Gate) => void;
}) {
  const activeIdx = ORDER.findIndex((s) => s.key === active);
  return (
    <div className="steps">
      {ORDER.map((s, i) => {
        const done = i < activeIdx;
        const on = i === activeIdx;
        const canJump = done && s.key !== "render" && onJump;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span className="sep" />}
            <button
              className={`st${on ? " on" : ""}${done ? " done" : ""}`}
              onClick={canJump ? () => onJump(s.key as Gate) : undefined}
              style={{ cursor: canJump ? "pointer" : "default" }}
            >
              <span className="n">{done ? <IconCheck /> : i + 1}</span>
              {s.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
