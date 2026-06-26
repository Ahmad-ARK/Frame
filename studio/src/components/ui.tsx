// Small shared primitives: sidebar rail, button, the ring/skeleton loaders, the
// toast host, and a top-level error boundary. Nothing here knows about the
// pipeline — they're pure presentation wired to the store where needed.
import { Component, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconClose, IconGrid, IconHome, IconWarn } from "../icons";
import { useStore, type Screen } from "../store";
import { log } from "../log";

export function Button({
  variant = "ghost",
  size,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost";
  size?: "sm";
  loading?: boolean;
}) {
  return (
    <button className={`btn ${variant}${size ? " " + size : ""}`} {...rest} disabled={rest.disabled || loading}>
      {loading && <span className="spin" />}
      {children}
    </button>
  );
}

export function Sidebar() {
  const { state, go } = useStore();
  const item = (screen: Screen, on: boolean, label: string, icon: ReactNode) => (
    <button className={`snav${on ? " on" : ""}`} title={label} aria-label={label} onClick={() => go(screen)}>
      {icon}
    </button>
  );
  return (
    <aside className="side">
      <div className="mk"><i /></div>
      {item("welcome", state.screen === "welcome", "Home", <IconHome />)}
      {item("library", state.screen === "library", "Library", <IconGrid />)}
      <div className="sp" />
    </aside>
  );
}

/** Circular progress ring (0..1). Used on the generating screen. */
export function Ring({ value, label }: { value: number; label?: string }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="gen-ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
        <motion.circle
          cx="48" cy="48" r={r} fill="none" stroke="var(--amber)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(0.02, value)) }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
        />
      </svg>
      {label && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "var(--mono)", fontSize: 15 }}>
          {label}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function ToastHost() {
  const { state, dismiss } = useStore();
  return (
    <div className="toasts">
      <AnimatePresence>
        {state.toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast${t.kind === "error" ? " err" : ""}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <span className="ti" style={{ color: t.kind === "success" ? "var(--green)" : t.kind === "error" ? "var(--red)" : "var(--ink-2)" }}>
              <IconWarn />
            </span>
            <div className="tt">
              <b>{t.title}</b>
              {t.detail && <span>{t.detail}</span>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss"><IconClose style={{ width: 16, height: 16 }} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: { componentStack: string }) {
    log.error("react render crash", { message: err.message, componentStack: info.componentStack });
  }
  render() {
    if (this.state.err) {
      return (
        <div className="boom">
          <IconWarn style={{ width: 34, height: 34, color: "var(--red)" }} />
          <h2>Something came loose.</h2>
          <p>The studio hit an unexpected error. Your work up to the last save is safe.</p>
          <code>{this.state.err.message}</code>
          <button className="btn ghost" onClick={() => location.reload()}>Reload studio</button>
        </div>
      );
    }
    return this.props.children;
  }
}
