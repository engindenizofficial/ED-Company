import { NextResponse } from "next/server"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import { ensurePrediction } from "@/lib/predict-service"
import { getCachedLive, setCachedLive } from "@/lib/redis"
import type { AnalysisResponse, LiveMatchData } from "@/lib/types"

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

  try {
    // ---- Live data: reuse the shared Redis copy unless refreshing ----
    let live: LiveMatchData | null = null
    let liveCachedAt = Date.now()

    if (!refresh) {
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

    // ---- Gemini prediction: locked, generate once if missing ----
    const prediction = await ensurePrediction(live.fixture)

    const payload: AnalysisResponse = {
      live,
      prediction,
      liveCachedAt,
      predictionLocked: true,
    }
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    // Best-effort fallback: serve whatever live data we last saved.
    const cachedLive = await getCachedLive(fixtureId)
    if (cachedLive) {
      const { getLockedPrediction } = await import("@/lib/redis")
      const prediction = await getLockedPrediction(fixtureId)
      if (prediction) {
        return NextResponse.json({
          live: cachedLive,
          prediction,
          liveCachedAt: Date.now(),
          predictionLocked: true,
          stale: true,
        } satisfies AnalysisResponse)
      }
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
