import { getFixturesByDate } from "@/lib/api-football"
import { getCachedFixtures, setCachedFixtures } from "@/lib/redis"
import type { Fixture, FixturesResponse } from "@/lib/types"

// app/api/fixtures/route.ts ile app/page.tsx (ve app/mac/[id]/page.tsx) aynı
// "cache'den oku, yoksa API'den çek" mantığını paylaşması gerekiyordu.
// Bu fonksiyon o mantığı tek yerde tutar: route handler client tarafından
// fetch ile çağrılırken, sayfa component'leri bunu doğrudan sunucuda
// (network round-trip olmadan) çağırıp "Maçlar yükleniyor" animasyonu hiç
// görünmeden ilk HTML'de hazır veriyle gelebilir.
export async function getFixturesResponse(date: string, refresh = false): Promise<FixturesResponse> {
  if (!refresh) {
    try {
      const cached = await getCachedFixtures(date)
      if (cached) return cached
    } catch {
      // Redis erişim hatası, devam et
    }
  }

  try {
    const fixtures: Fixture[] = await getFixturesByDate(date, refresh)
    const payload: FixturesResponse = { date, fixtures, cachedAt: Date.now() }
    await setCachedFixtures(date, payload)
    return payload
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures fetch failed:", message)

    try {
      const cached = await getCachedFixtures(date)
      if (cached) return { ...cached, stale: true }
    } catch {
      // ignore
    }

    return { date, fixtures: [], cachedAt: Date.now(), stale: true }
  }
}

export function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}
