import { NextResponse } from "next/server"
import { getFixtureById, getHeadToHead, getTeamForm } from "@/lib/api-football"
import { buildPrediction } from "@/lib/prediction"
import { getServerCache, setServerCache } from "@/lib/server-cache"
import type { AnalysisResult } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  const cacheKey = `analyze:${fixtureId}`

  try {
    const fixture = await getFixtureById(fixtureId)
    if (!fixture) {
      return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
    }

    const [homeForm, awayForm, h2h] = await Promise.all([
      getTeamForm(fixture.home, 10),
      getTeamForm(fixture.away, 10),
      getHeadToHead(fixture.home.id, fixture.away.id, 6),
    ])

    const prediction = buildPrediction(homeForm, awayForm, h2h)

    const result: AnalysisResult = { fixture, homeForm, awayForm, h2h, prediction, source: "live" }
    // Remember this genuine analysis so we can fall back to it later.
    setServerCache(cacheKey, result)
    return NextResponse.json(result)
  } catch (err) {
    // Do NOT fabricate an analysis. Serve the last real analysis we fetched for
    // this match; only error out if we have never had a success.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    const cached = getServerCache<AnalysisResult>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached.data, stale: true, cachedAt: cached.ts })
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
