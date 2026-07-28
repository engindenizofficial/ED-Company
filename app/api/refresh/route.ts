import { NextResponse } from "next/server"
import { getFixturesByDate, getFixtureById, getLiveMatchData, getFixturePlayerStats } from "@/lib/api-football"
import {
  setCachedFixtures,
  setCachedLive,
  setCachedFixturePlayerStats,
} from "@/lib/redis"
import type { Fixture, FixturesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
// Her maç için birbirinden bağımsız API çağrıları yapılacak, bu sürebilir.
export const maxDuration = 60

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

  // 2. Her maçın analizini API'den paralel çek ve cache'le
  // Çok fazla maç varsa API kotasını korumak için sıralı değil, eş zamanlı ama sınırlı adet çalıştır.
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

  // Concurrency limiti ile sırayla çalıştır
  for (let i = 0; i < fixtures.length; i += CONCURRENCY) {
    const batch = fixtures.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(analyzeFixture))
  }

  return NextResponse.json({
    ok: true,
    date,
    total: fixtures.length,
    completed,
    failed,
    cachedAt: Date.now(),
  })
}
