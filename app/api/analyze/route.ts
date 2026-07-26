import { NextResponse } from "next/server"
import { getFixtureById, getLiveMatchData, getFixturePlayerStats } from "@/lib/api-football"
import { getCachedLive, setCachedLive, getCachedFixturePlayerStats, setCachedFixturePlayerStats } from "@/lib/redis"
import type { AnalysisResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))
  const refresh = searchParams.get("refresh") === "1"

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  try {
    let liveCachedAt = Date.now()

    // Live match data
    let live = refresh ? null : await getCachedLive(fixtureId)
    if (!live) {
      const fixture = await getFixtureById(fixtureId)
      if (!fixture) return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
      live = await getLiveMatchData(fixture)
      await setCachedLive(fixtureId, live)
      liveCachedAt = Date.now()
    } else {
      liveCachedAt = Date.now()
    }

    // Player stats
    let playerStats = refresh ? null : await getCachedFixturePlayerStats(fixtureId)
    if (!playerStats) {
      playerStats = await getFixturePlayerStats(fixtureId)
      await setCachedFixturePlayerStats(fixtureId, playerStats)
    }

    const payload: AnalysisResponse = {
      live,
      playerStats,
      liveCachedAt,
    }

    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    // Fallback to cached live data
    const cached = await getCachedLive(fixtureId)
    if (cached) {
      const cachedPlayerStats = await getCachedFixturePlayerStats(fixtureId)
      return NextResponse.json({
        live: cached,
        playerStats: cachedPlayerStats ?? [],
        liveCachedAt: Date.now(),
        stale: true,
      } satisfies AnalysisResponse)
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
