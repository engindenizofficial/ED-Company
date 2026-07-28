import { NextResponse } from "next/server"
import { getFixtureById, getLiveMatchData, getFixturePlayerStats } from "@/lib/api-football"
import type { AnalysisResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // Her panel açılışında doğrudan API'den taze veri çek — cache kullanılmaz, kaydedilmez
  try {
    const fixture = await getFixtureById(fixtureId)
    if (!fixture) return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })

    const [live, playerStats] = await Promise.all([
      getLiveMatchData(fixture),
      getFixturePlayerStats(fixtureId),
    ])

    const payload: AnalysisResponse = {
      live,
      playerStats,
      liveCachedAt: Date.now(),
    }
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
