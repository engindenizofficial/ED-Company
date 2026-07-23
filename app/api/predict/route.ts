import { NextResponse } from "next/server"
import { getFixtureById } from "@/lib/api-football"
import { ensurePrediction } from "@/lib/predict-service"
import { getLockedPrediction } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Returns the LOCKED Gemini score/prediction for a single fixture, generating
// it once if it has never been made. Used to fill the score shown on cards.
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
