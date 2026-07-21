// Server-side in-memory store for the last successfully fetched *real* data.
//
// Goal: when API-Football is rate limited / down, we still return the most
// recent genuine response instead of an error or fake matches. This persists
// across requests for the lifetime of the server process, so every client
// (even a brand new one with empty localStorage) receives the last real data.
//
// Note: this is best-effort. On serverless it lives as long as the warm
// instance; that's acceptable here since the client also keeps its own copy.

interface Entry<T> {
  data: T
  ts: number // epoch ms when stored
}

// Use a global so the map survives module re-evaluation / HMR in dev.
const globalStore = globalThis as unknown as {
  __aitdServerCache?: Map<string, Entry<unknown>>
}

const store: Map<string, Entry<unknown>> = (globalStore.__aitdServerCache ??= new Map())

/** Persist a real response keyed by e.g. `fixtures:2026-07-21`. */
export function setServerCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() })
}

/** Read the last good response for a key, or null if never stored. */
export function getServerCache<T>(key: string): { data: T; ts: number } | null {
  const entry = store.get(key)
  if (!entry) return null
  return { data: entry.data as T, ts: entry.ts }
}
