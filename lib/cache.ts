// Client-side localStorage store for the last successfully fetched *real* data.
//
// Goal: never show fake/mock matches and never burn API-Football quota. We keep
// the most recent genuine API response forever (no expiry) so page loads, F5
// and match clicks reuse it. A real network request only happens via the
// refresh button (or a one-time bootstrap when nothing has ever been stored).

const PREFIX = "aitd-live:" // namespace for last-good live data

interface Entry<T> {
  data: T
  ts: number // epoch ms when stored
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

/** Read the last good (real) response for a key, or null if never stored. */
export function readLastGood<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry<T>
    return entry.data
  } catch {
    return null
  }
}

/** Persist a real response so it survives reloads with no expiry. */
export function writeLastGood<T>(key: string, data: T): void {
  if (!isBrowser()) return
  try {
    const entry: Entry<T> = { data, ts: Date.now() }
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // Quota exceeded or serialization error — safe to ignore.
  }
}

/** Return the epoch ms a key was last stored at, or null. */
export function lastGoodTimestamp(key: string): number | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry<unknown>
    return entry.ts ?? null
  } catch {
    return null
  }
}
