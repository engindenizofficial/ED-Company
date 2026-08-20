import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { getCachedFixtures, setCachedFixtures } from "@/lib/redis"
import type { Fixture, FixturesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

// Türkiye saatiyle bugünün tarihini döndürür (YYYY-MM-DD).
function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

// Türkiye saatiyle dünün tarihini döndürür (YYYY-MM-DD).
function yesterdayTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() - 1)
  return trNow.toLocaleDateString("sv-SE")
}

// Türkiye saatiyle yarının tarihini döndürür (YYYY-MM-DD).
function tomorrowTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() + 1)
  return trNow.toLocaleDateString("sv-SE")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = searchParams.get("date")
  const today = todayTR()
  const yesterday = yesterdayTR()
  const tomorrow = tomorrowTR()
  // Sadece TR saatiyle "dün", "bugün" ve "yarın" desteklenir — başka bir
  // tarih istenirse (veya hiç istenmezse) güvenli varsayılan olarak bugüne
  // düşülür. Gece 00:00'da (TR saati) her üç tarih de otomatik kayar.
  const date = requested === yesterday || requested === tomorrow ? requested : today
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

  // API'den taze veri çek. refresh=1 ise Next.js fetch cache'ini VE
  // api-football-client'taki bellek içi cache'i atlayarak gerçekten taze
  // veri garantiler (aksi halde "yenile" 2 dakikaya kadar bayat veri
  // döndürebiliyordu).
  try {
    const fixtures: Fixture[] = await getFixturesByDate(date, refresh)
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
