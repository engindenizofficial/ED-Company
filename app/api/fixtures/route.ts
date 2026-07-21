import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { getServerCache, setServerCache } from "@/lib/server-cache"
import type { FixturesResponse } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)
  const cacheKey = `fixtures:${date}`

  try {
    const fixtures = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, source: "live" }
    // Remember this genuine response so we can fall back to it later.
    setServerCache(cacheKey, payload)
    return NextResponse.json(payload)
  } catch (err) {
    // API down, key invalid or rate limit hit. Do NOT invent fake matches —
    // instead serve the last real response we pulled from the API. Only if we
    // have never had a success do we surface an error.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed:", message)

    const cached = getServerCache<FixturesResponse>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached.data, stale: true, cachedAt: cached.ts })
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
