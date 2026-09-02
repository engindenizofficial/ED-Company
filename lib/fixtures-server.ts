import { getFixturesByDate } from "@/lib/api-football"
import { getCachedFixtures, setCachedFixtures } from "@/lib/redis"
import {
  getRelativeDateKey,
  normalizeTimeZone,
  SERVER_TIME_ZONE,
} from "@/lib/fixture-datetime"
import type { Fixture, FixturesResponse } from "@/lib/types"

// Client istekleri ziyaretçinin saat dilimini gönderir. Sunucu tarafından
// oluşturulan ilk HTML ise cihaz bilgisi henüz bilinmediği için mevcut hızlı
// İstanbul verisini kullanır; hydration sonrası istemci doğru bölgeyle uzlaşır.
export async function getFixturesResponse(
  date: string,
  refresh = false,
  requestedTimeZone = SERVER_TIME_ZONE,
): Promise<FixturesResponse> {
  const timeZone = normalizeTimeZone(requestedTimeZone, SERVER_TIME_ZONE)

  if (!refresh) {
    try {
      const cached = await getCachedFixtures(date, timeZone)
      if (cached) return cached
    } catch {
      // Redis erişim hatası, devam et
    }
  }

  try {
    const fixtures: Fixture[] = await getFixturesByDate(date, refresh, timeZone)
    const payload: FixturesResponse = { date, fixtures, cachedAt: Date.now() }
    await setCachedFixtures(date, payload, timeZone)
    return payload
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures fetch failed:", message)

    try {
      const cached = await getCachedFixtures(date, timeZone)
      if (cached) return { ...cached, stale: true }
    } catch {
      // ignore
    }

    return { date, fixtures: [], cachedAt: Date.now(), stale: true }
  }
}

function todayTR(): string {
  return getRelativeDateKey(0, SERVER_TIME_ZONE)
}

function yesterdayTR(): string {
  return getRelativeDateKey(-1, SERVER_TIME_ZONE)
}

function tomorrowTR(): string {
  return getRelativeDateKey(1, SERVER_TIME_ZONE)
}
