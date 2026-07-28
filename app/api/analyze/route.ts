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

  // Yenile butonuna basılmadıysa cache'den döndür
  if (!refresh) {
    try {
      const cachedLive = await getCachedLive(fixtureId)
      const cachedPlayerStats = await getCachedFixturePlayerStats(fixtureId)
      if (cachedLive && cachedPlayerStats) {
        const payload: AnalysisResponse = {
          live: cachedLive,
          playerStats: cachedPlayerStats,
          liveCachedAt: Date.now(),
        }
        return NextResponse.json(payload)
      }
    } catch {
      // Redis erişim hatası, devam et
    }
  }

  // API'den taze veri çek
  try {
    const fixture = await getFixtureById(fixtureId)
    if (!fixture) return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })

    const [live, playerStats] = await Promise.all([
      getLiveMatchData(fixture),
      getFixturePlayerStats(fixtureId),
    ])

    await Promise.all([
      setCachedLive(fixtureId, live),
      setCachedFixturePlayerStats(fixtureId, playerStats),
    ])

    const payload: AnalysisResponse = {
      live,
      playerStats,
      liveCachedAt: Date.now(),
    }
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    // API başarısız olursa eski cache'i döndür
    try {
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
    } catch {
      // ignore
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
