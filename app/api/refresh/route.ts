import { NextResponse } from "next/server"
import { getFixturesByDate, getFixtureById, getLiveMatchData, getFixturePlayerStats } from "@/lib/api-football"
import {
  setCachedFixtures,
  setCachedLive,
  setCachedFixturePlayerStats,
} from "@/lib/redis"
import type { Fixture, FixturesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Şu anda oynanmakta olan maçların statusShort değerleri
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"])

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

export async function POST() {
  const date = todayTR()

  // 1. Tüm fikstürleri API'den çek ve cache'le
  let fixtures: Fixture[] = []
  try {
    fixtures = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, cachedAt: Date.now() }
    await setCachedFixtures(date, payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: `Fikstürler çekilemedi: ${message}` }, { status: 502 })
  }

  // 2. Yalnızca CANLI maçların analizini API'den çek ve cache'le.
  //    Bitmış veya başlamamış maçların detayları daha önce yüklendiyse
  //    zaten cache'de durur; tekrar çekmiyoruz (API kotası korunur).
  const liveFixtures = fixtures.filter((f) => LIVE_STATUSES.has(f.statusShort))

  const CONCURRENCY = 5
  let completed = 0
  let failed = 0

  async function analyzeFixture(fixture: Fixture) {
    try {
      const full = await getFixtureById(fixture.id)
      if (!full) { failed++; return }
      const [live, playerStats] = await Promise.all([
        getLiveMatchData(full),
        getFixturePlayerStats(fixture.id),
      ])
      await Promise.all([
        setCachedLive(fixture.id, live),
        setCachedFixturePlayerStats(fixture.id, playerStats),
      ])
      completed++
    } catch {
      failed++
    }
  }

  for (let i = 0; i < liveFixtures.length; i += CONCURRENCY) {
    const batch = liveFixtures.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(analyzeFixture))
  }

  return NextResponse.json({
    ok: true,
    date,
    totalFixtures: fixtures.length,
    liveFixtures: liveFixtures.length,
    completed,
    failed,
    cachedAt: Date.now(),
  })
}
