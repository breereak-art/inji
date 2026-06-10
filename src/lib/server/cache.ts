/**
 * In-memory TTL cache with stale-while-error fallback.
 *
 * Scope note: per-process memory. On serverless (Vercel) each warm instance
 * has its own cache — that's the intended best-effort behavior for this app's
 * read-heavy, short-TTL data. Nothing here is a source of truth.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

function prune() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
  // still oversized → drop oldest insertions
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) return undefined;
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  prune();
}

/**
 * Cache-through helper. On upstream failure, serves the last known value
 * (even if expired) for up to `staleMs` past expiry before rethrowing —
 * a flaky RPC shouldn't blank the UI.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  staleMs = 5 * 60_000
): Promise<T> {
  const fresh = cacheGet<T>(key);
  if (fresh !== undefined) return fresh;

  try {
    const value = await fetcher();
    cacheSet(key, value, ttlMs);
    return value;
  } catch (error) {
    const stale = store.get(key);
    if (stale && stale.expiresAt + staleMs > Date.now()) {
      return stale.value as T;
    }
    throw error;
  }
}
