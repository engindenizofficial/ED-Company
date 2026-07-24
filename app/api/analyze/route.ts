import { NextResponse } from "next/server"
import { getFixtureById, getFixturePlayerStats, getLiveMatchData } from "@/lib/api-football"
import { getCachedFixturePlayerStats, getCachedLive, getLockedPrediction, setCachedFixturePlayerStats, setCachedLive } from "@/lib/redis"
import type { AnalysisResponse, FixturePlayerStat, LiveMatchData } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Powers the detail panel: LIVE API-Football data (refreshable) + the LOCKED
// Gemini prediction (generated once, never changes).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))
  const refresh = searchParams.get("refresh") === "1"

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  const shouldBypassCache = refresh

  try {
    // ---- Live data: reuse the shared Redis copy unless refreshing ----
    let live: LiveMatchData | null = null
    let liveCachedAt = Date.now()

    if (!shouldBypassCache) {
      const cached = await getCachedLive(fixtureId)
      if (cached) live = cached
    }

    if (!live) {
      const fixture = await getFixtureById(fixtureId)
      if (!fixture) {
        return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
      }
      live = await getLiveMatchData(fixture)
      liveCachedAt = Date.now()
      await setCachedLive(fixtureId, live)
    }

    // ---- Per-player match stats ----
    let playerStats: FixturePlayerStat[] = []
    if (!shouldBypassCache) {
      const cached = await getCachedFixturePlayerStats(fixtureId)
      if (cached) playerStats = cached
    }
    if (playerStats.length === 0) {
      playerStats = await getFixturePlayerStats(fixtureId)
      if (playerStats.length > 0) await setCachedFixturePlayerStats(fixtureId, playerStats)
    }

    // ---- Gemini prediction: only serve if already locked in Redis.
    // We never trigger a new Gemini call from here — the card queue handles
    // generation. This avoids 429s when the panel is opened mid-queue.
    const prediction = await getLockedPrediction(fixtureId)

    const payload: AnalysisResponse = {
      live,
      prediction: prediction ?? null,
      playerStats,
      liveCachedAt,
      predictionLocked: !!prediction,
    }
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    // Best-effort fallback: serve whatever live data we last saved.
    const cachedLive = await getCachedLive(fixtureId)
    if (cachedLive) {
      const [prediction, cachedPlayerStats] = await Promise.all([
        getLockedPrediction(fixtureId),
        getCachedFixturePlayerStats(fixtureId),
      ])
      return NextResponse.json({
        live: cachedLive,
        prediction: prediction ?? null,
        playerStats: cachedPlayerStats ?? [],
        liveCachedAt: Date.now(),
        predictionLocked: !!prediction,
        stale: true,
      } satisfies AnalysisResponse)
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
