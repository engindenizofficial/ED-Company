import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { getCachedFixtures, setCachedFixtures } from "@/lib/redis"
import type { Fixture, FixturesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

// Türkiye saatiyle bugünün tarihini döndürür (YYYY-MM-DD).
function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = todayTR()
  const refresh = searchParams.get("refresh") === "1"

  try {
    let fixtures: Fixture[] | null = null
    let cachedAt = Date.now()

    if (!refresh) {
      const cached = await getCachedFixtures(date)
      if (cached) {
        fixtures = cached.fixtures
        cachedAt = cached.cachedAt
      }
    }

    if (!fixtures) {
      fixtures = await getFixturesByDate(date)
      cachedAt = Date.now()
    }

    const payload: FixturesResponse = { date, fixtures, cachedAt }
    await setCachedFixtures(date, payload)

    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed:", message)

    const cached = await getCachedFixtures(date)
    if (cached) return NextResponse.json({ ...cached, stale: true })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
