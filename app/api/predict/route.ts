import { NextResponse } from "next/server"
import { getFixtureById } from "@/lib/api-football"
import { ensurePrediction } from "@/lib/predict-service"
import { getLockedPrediction } from "@/lib/redis"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST: client sends the fixture object it already has, avoiding a redundant
//       API-Football call when generating the prediction for the first time.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fixture = body?.fixture as Fixture | undefined
    if (!fixture?.id) {
      return NextResponse.json({ error: "fixture gerekli." }, { status: 400 })
    }

    // Fast path: already locked.
    const existing = await getLockedPrediction(fixture.id)
    if (existing) {
      return NextResponse.json({ prediction: existing, locked: true })
    }

    const prediction = await ensurePrediction(fixture)
    return NextResponse.json({ prediction, locked: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tahmin üretilemedi"
    console.log("[v0] predict API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// GET: fallback — fetches fixture by id then delegates to POST logic.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  try {
    // Fast path: already locked, no API-Football or Gemini calls needed.
    const existing = await getLockedPrediction(fixtureId)
    if (existing) {
      return NextResponse.json({ prediction: existing, locked: true })
    }

    const fixture = await getFixtureById(fixtureId)
    if (!fixture) {
      return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
    }

    const prediction = await ensurePrediction(fixture)
    return NextResponse.json({ prediction, locked: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tahmin üretilemedi"
    console.log("[v0] predict API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
