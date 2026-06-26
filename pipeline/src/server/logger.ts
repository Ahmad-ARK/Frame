// Minimal structured logger. One line per event, JSON after a human prefix, so it
// reads fine in a terminal AND greps/parses cleanly. No deps. PRODUCTION SWAP:
// pipe these to pino/winston → a log sink (Datadog/Loki); the call sites won't
// change. Everything goes to stderr so stdout stays clean for any piping.

export type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

const COLOR: Record<Level, string> = {
  debug: "\x1b[2m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const useColor = process.stderr.isTTY;

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < MIN) return;
  const ts = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  const head = useColor ? `${COLOR[level]}${tag}${RESET}` : tag;
  let line = `${ts} ${head} ${msg}`;
  if (fields && Object.keys(fields).length) line += ` ${safeJson(fields)}`;
  process.stderr.write(line + "\n");
}

/** Stringify log fields without throwing on circular refs / BigInt. */
function safeJson(o: Record<string, unknown>): string {
  try {
    return JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return "{…unserializable…}";
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

/** Normalize any thrown value into {message, stack} for logging. */
export function errInfo(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}
