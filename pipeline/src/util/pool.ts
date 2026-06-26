// Bounded-concurrency map + a per-host min-interval throttle. Lets the asset stage
// pull from several services at once (they're different hosts) while staying
// polite to any single host. No deps.

/**
 * Run `fn` over `items` with at most `concurrency` in flight at a time. Preserves
 * result order. `fn` should handle its own errors (return a result object) if you
 * don't want one rejection to abort the whole pool.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/**
 * Returns a gate you `await throttle(key)` before each outbound call. Calls
 * sharing a `key` (e.g. a host) are spaced at least `minIntervalMs` apart;
 * different keys proceed independently. Reservation is synchronous (atomic in the
 * single-threaded event loop) so concurrent callers for the same key queue in
 * order without hammering it.
 */
export function hostThrottle(minIntervalMs: number) {
  const nextAllowed = new Map<string, number>();
  return async (key: string): Promise<void> => {
    const now = Date.now();
    const earliest = Math.max(now, nextAllowed.get(key) ?? 0);
    nextAllowed.set(key, earliest + minIntervalMs);
    const wait = earliest - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };
}

/** Host of a URL, for throttle keys. Falls back to "unknown" on a bad URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}
