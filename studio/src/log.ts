// Lightweight client logger. Wraps console with levels + structured context and
// keeps a small in-memory ring buffer (handy for a future "copy diagnostics"
// button or a debug panel). Also installs global handlers so an unhandled error
// or promise rejection is captured rather than vanishing into the void.

type Level = "debug" | "info" | "warn" | "error";

interface Entry {
  ts: string;
  level: Level;
  msg: string;
  ctx?: Record<string, unknown>;
}

const RING_MAX = 200;
const ring: Entry[] = [];

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const entry: Entry = { ts: new Date().toISOString(), level, msg, ctx };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();
  const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
  if (ctx) fn(`[${level}] ${msg}`, ctx);
  else fn(`[${level}] ${msg}`);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
  /** Snapshot of recent log entries (newest last) — for diagnostics export. */
  history: () => [...ring],
};

let installed = false;
/** Capture otherwise-silent global failures once, at app start. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => log.error("window.onerror", { message: e.message, source: e.filename, line: e.lineno }));
  window.addEventListener("unhandledrejection", (e) => log.error("unhandledrejection", { reason: String((e as PromiseRejectionEvent).reason) }));
}
