// Client-side localStorage cache with a 1 hour TTL.
// Used to avoid burning API-Football quota on every page refresh.

const TTL_MS = 60 * 60 * 1000 // 1 hour
const PREFIX = "aitd-cache:" // AI Teknik Direktör cache namespace

interface CacheEntry<T> {
  data: T
  ts: number // epoch ms when stored
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

/** Read a fresh (non-expired) cache entry, or null if missing/stale/unavailable. */
export function readCache<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - entry.ts > TTL_MS) {
      window.localStorage.removeItem(PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

/** Store a value in the cache with the current timestamp. */
export function writeCache<T>(key: string, data: T): void {
  if (!isBrowser()) return
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() }
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // Quota exceeded or serialization error — safe to ignore.
  }
}

/** Return the epoch ms a key was cached at, or null. */
export function cacheTimestamp(key: string): number | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<unknown>
    return entry.ts ?? null
  } catch {
    return null
  }
}

/** Remove a single cache entry (used to force a live refresh). */
export function clearCache(key: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/** Remove every entry in our namespace. */
export function clearAllCache(): void {
  if (!isBrowser()) return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX)) toRemove.push(k)
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
