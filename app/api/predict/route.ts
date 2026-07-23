import { NextResponse } from "next/server"
import { getFixtureById } from "@/lib/api-football"
import { forceEnsurePrediction } from "@/lib/predict-service"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST: client sends the fixture object it already has. Always generates a
// fresh prediction with full API-Football data (form, H2H, standings, injuries,
// lineups, statistics) and overwrites any previous incomplete prediction in Redis.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fixture = body?.fixture as Fixture | undefined
    if (!fixture?.id) {
      return NextResponse.json({ error: "fixture gerekli." }, { status: 400 })
    }

    const prediction = await forceEnsurePrediction(fixture)
    return NextResponse.json({ prediction, locked: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tahmin üretilemedi"
    console.log("[v0] predict API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// GET: fallback — fetches fixture by id then generates fresh prediction.
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

    const prediction = await forceEnsurePrediction(fixture)
    return NextResponse.json({ prediction, locked: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tahmin üretilemedi"
    console.log("[v0] predict API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
