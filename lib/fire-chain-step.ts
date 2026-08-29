export async function fireChainStepWithoutAwaitingResponse(
  url: string,
  headers: Record<string, string> = {},
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1500)

  try {
    await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) throw error
  } finally {
    clearTimeout(timer)
  }
}
