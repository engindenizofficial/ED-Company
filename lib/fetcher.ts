import { readCache, readLastGood, writeCache, writeLastGood } from "./cache"

async function networkFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `İstek başarısız (${res.status})`)
  }
  return res.json()
}

// Cache-aware fetcher: returns fresh (<1h) localStorage data without touching
// the network, protecting the API-Football quota on page refreshes. A real
// request only happens on a cache miss (i.e. after the cache is cleared by the
// refresh button, or once the 1 hour TTL expires).
//
// Quota/outage handling: if the server responds with synthetic mock data
// (source === "mock"), we DON'T show it when we still have the last real API
// response stored. Instead we reuse that last live snapshot, flagged as stale
// (real but possibly outdated). Mock data is only a last resort when no live
// data was ever fetched.
export async function fetcher<T>(url: string): Promise<T> {
  const cached = readCache<T>(url)
  if (cached !== null) {
    return cached
  }

  const data = await networkFetch<T>(url)
  const source = (data as { source?: string }).source

  if (source === "live") {
    // Real data — cache it and keep a persistent copy for future fallbacks.
    writeCache(url, data)
    writeLastGood(url, data)
    return data
  }

  // source === "mock": live API failed or quota exhausted.
  const lastGood = readLastGood<T>(url)
  if (lastGood !== null) {
    // Serve the last REAL data instead of synthetic matches, flagged as stale.
    const stale = { ...(lastGood as object), source: "live", stale: true } as T
    writeCache(url, stale)
    return stale
  }

  // No previous live data exists — fall back to mock so the UI still works.
  writeCache(url, data)
  return data
}
