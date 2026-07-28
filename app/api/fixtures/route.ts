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

  // Yenile butonuna basılmadıysa cache'den döndür
  if (!refresh) {
    try {
      const cached = await getCachedFixtures(date)
      if (cached) return NextResponse.json(cached)
    } catch {
      // Redis erişim hatası, devam et
    }
  }

  // API'den taze veri çek
  try {
    const fixtures: Fixture[] = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, cachedAt: Date.now() }
    await setCachedFixtures(date, payload)
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed:", message)

    // API başarısız olursa eski cache'i döndür
    try {
      const cached = await getCachedFixtures(date)
      if (cached) return NextResponse.json({ ...cached, stale: true })
    } catch {
      // ignore
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
