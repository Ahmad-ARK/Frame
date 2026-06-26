// Minimal API-key auth. FIRST-SLICE: keys come from the API_KEYS env var (comma-
// separated). The returned key string doubles as the job "owner" for tenant
// isolation. PRODUCTION SWAP: replace with real auth (Clerk/Auth0/Supabase) issuing
// per-user sessions + scoped API keys; the `authenticate()` seam stays the same.

const keys = (): string[] =>
  (process.env.API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

export const authDisabled = (): boolean => keys().length === 0;

/** Returns the caller's key (used as owner id), or null if unauthorized. */
export function authenticate(authHeader?: string): string | null {
  const configured = keys();
  // Dev mode: no keys configured → auth disabled, single shared "dev" owner.
  if (configured.length === 0) return "dev";
  const m = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const presented = m?.[1]?.trim();
  return presented && configured.includes(presented) ? presented : null;
}
