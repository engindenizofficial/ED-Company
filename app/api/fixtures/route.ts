import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { getCachedFixtures, getLockedPredictionsMap, setCachedFixtures } from "@/lib/redis"
import type { Fixture, FixturesResponse, FixtureWithPrediction } from "@/lib/types"

export const dynamic = "force-dynamic"

// Türkiye saatiyle bugünün tarihini döndürür (YYYY-MM-DD).
function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Parametre gelse bile her zaman Türkiye saatiyle bugünü kullan.
  const date = todayTR()
  const refresh = searchParams.get("refresh") === "1"

  try {
    // Base fixture list: use the shared Redis copy unless the user explicitly
    // asked for a live refresh. This is what stops every visitor from hitting
    // API-Football — the first fetch fills Redis, everyone else reuses it.
    let baseFixtures: Fixture[] | null = null
    let cachedAt = Date.now()

    if (!refresh) {
      const cached = await getCachedFixtures(date)
      if (cached) {
        baseFixtures = cached.fixtures
        cachedAt = cached.cachedAt
      }
    }

    if (!baseFixtures) {
      baseFixtures = await getFixturesByDate(date)
      cachedAt = Date.now()
    }

    // Always overlay the latest LOCKED Gemini predictions so newly generated
    // score predictions appear on cards without regenerating anything.
    const predMap = await getLockedPredictionsMap(baseFixtures.map((f) => f.id))
    const fixtures: FixtureWithPrediction[] = baseFixtures.map((f) => {
      const pred = predMap.get(f.id)
      return {
        ...f,
        predictedScore: pred ? pred.score : null,
        predictedWinner: pred ? pred.winner : null,
      }
    })

    const payload: FixturesResponse = { date, fixtures, cachedAt }
    // Persist the raw base list (without predictions layered so it stays small).
    await setCachedFixtures(date, { date, fixtures: fixtures.map(stripPrediction), cachedAt })

    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed:", message)

    // Fall back to whatever we last saved so users still see real data.
    const cached = await getCachedFixtures(date)
    if (cached) return NextResponse.json({ ...cached, stale: true })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function stripPrediction(f: FixtureWithPrediction): FixtureWithPrediction {
  return { ...f, predictedScore: null, predictedWinner: null }
}
