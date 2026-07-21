import { readLastGood, writeLastGood } from "./cache"

/** Raw network request. Throws on non-2xx so callers can keep old data. */
export async function networkFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `İstek başarısız (${res.status})`)
  }
  return (await res.json()) as T
}

// SWR fetcher. This NEVER hits the network when real data is already stored, so
// opening the site, pressing F5 and clicking matches all reuse the last real
// API response instead of spending quota. A single bootstrap request runs only
// when nothing has ever been stored for this key (otherwise the screen would be
// empty on first ever use). All subsequent live requests go through the refresh
// button, which calls networkFetch directly.
export async function fetcher<T>(url: string): Promise<T> {
  const cached = readLastGood<T>(url)
  if (cached !== null) return cached

  const data = await networkFetch<T>(url)
  writeLastGood(url, data)
  return data
}
