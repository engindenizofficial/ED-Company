import { readCache, writeCache } from "./cache"

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
export async function fetcher<T>(url: string): Promise<T> {
  const cached = readCache<T>(url)
  if (cached !== null) {
    return cached
  }
  const data = await networkFetch<T>(url)
  writeCache(url, data)
  return data
}
