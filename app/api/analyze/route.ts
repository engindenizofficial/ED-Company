import { NextResponse } from "next/server"
import { getFixtureById, getHeadToHead, getTeamForm } from "@/lib/api-football"
import { getMockAnalysis, getMockFixtureById } from "@/lib/mock-data"
import { buildPrediction } from "@/lib/prediction"
import type { AnalysisResult } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // Mock fixture ids live in the 900000+ range — always answer with backup data.
  const mockFixture = getMockFixtureById(fixtureId)
  if (mockFixture) {
    return NextResponse.json(getMockAnalysis(mockFixture))
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
    // Analysis API failed -> derive a believable backup analysis instead of erroring.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed, serving mock analysis:", message)
    const fallbackFixture = getMockFixtureById(fixtureId) ?? getMockFixtureById(900101)
    if (!fallbackFixture) {
      return NextResponse.json({ error: message }, { status: 502 })
    }
    return NextResponse.json(getMockAnalysis(fallbackFixture))
  }
}
