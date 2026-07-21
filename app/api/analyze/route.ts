import { NextResponse } from "next/server"
import { getFixtureById, getHeadToHead, getTeamForm } from "@/lib/api-football"
import { buildPrediction } from "@/lib/prediction"
import type { AnalysisResult } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

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
    return NextResponse.json(result)
  } catch (err) {
    // Do NOT fabricate an analysis. Report the failure so the client keeps the
    // last real analysis it already fetched for this match.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
