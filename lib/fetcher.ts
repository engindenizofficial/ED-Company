// All shared data now lives in Redis on the server, so the client fetcher is a
// thin wrapper: it just reads from our API routes, which decide whether to
// serve the saved copy or pull fresh data. No client-side persistence needed.

/** Raw network request. Throws on non-2xx so callers can keep old data. */
export async function networkFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `İstek başarısız (${res.status})`)
  }
  return (await res.json()) as T
}

/** SWR fetcher. */
export async function fetcher<T>(url: string): Promise<T> {
  return networkFetch<T>(url)
}
