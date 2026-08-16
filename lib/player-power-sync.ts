import { db } from "./db"
import { playerPower, playerPowerProcessedFixture, playerMarketValue } from "./db/schema"
import { inArray } from "drizzle-orm"
import { getFixturesByDate, getFixturePlayerStats, currentSeason } from "./api-football"
import { FEATURED_LEAGUE_IDS } from "./leagues"
import {
  computeBasePower,
  computeFormModifier,
  computeCurrentPower,
  marketPowerFromValue,
  addMatchToRecent,
  type MatchPerformance,
} from "./player-power"

// ---------------------------------------------------------------------------
// Günlük cron'un çağırdığı yazma (write) katmanı. API-Football'dan son
// LOOKBACK_DAYS gündeki biten maçları (takip edilen 24 lige filtrelenmiş)
// tarar, her yeni (henüz işlenmemiş) fixture için oyuncu istatistiklerini
// çeker ve player_power tablosunu upsert eder. Uygulamanın okuma tarafı
// (players/search route'u) bu tabloyu sadece OKUR, bu dosyayı asla import
// etmez — bkz. lib/player-power.ts (saf skorlama fonksiyonları).
// ---------------------------------------------------------------------------

const FEATURED_LEAGUE_ID_SET = new Set(FEATURED_LEAGUE_IDS)
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"])

/**
 * Kaç gün geriye bakılsın. Cron günlük çalışsa da bir önceki çalışma
 * başarısız olur/eksik kalırsa (deploy, geçici API hatası vb.) bu pencere
 * telafi eder — aynı maç zaten `player_power_processed_fixture` ile
 * işaretliyse tekrar işlenmez.
 */
const LOOKBACK_DAYS = 2

function isoDateDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export interface PlayerPowerSyncResult {
  fixturesScanned: number
  fixturesProcessed: number
  playersUpdated: number
}

export async function runPlayerPowerSync(): Promise<PlayerPowerSyncResult> {
  const result: PlayerPowerSyncResult = { fixturesScanned: 0, fixturesProcessed: 0, playersUpdated: 0 }

  // 1. Son LOOKBACK_DAYS + bugün içindeki, takip edilen liglerde biten maçları topla.
  const dates = Array.from({ length: LOOKBACK_DAYS + 1 }, (_, i) => isoDateDaysAgo(i))
  const fixturesByDate = await Promise.all(dates.map((date) => getFixturesByDate(date)))
  const candidateFixtures = fixturesByDate
    .flat()
    .filter((f) => FEATURED_LEAGUE_ID_SET.has(f.league.id) && FINISHED_STATUSES.has(f.statusShort))

  result.fixturesScanned = candidateFixtures.length
  if (candidateFixtures.length === 0) return result

  // 2. Zaten işlenmiş fixture'ları ele — aynı maçın istatistiklerinin iki kez
  // forma eklenmesini engeller.
  const fixtureIds = candidateFixtures.map((f) => f.id)
  const processedRows = await db
    .select({ fixtureId: playerPowerProcessedFixture.fixtureId })
    .from(playerPowerProcessedFixture)
    .where(inArray(playerPowerProcessedFixture.fixtureId, fixtureIds))
  const processedSet = new Set(processedRows.map((r) => r.fixtureId))
  const newFixtures = candidateFixtures.filter((f) => !processedSet.has(f.id))

  if (newFixtures.length === 0) return result

  // 3. Yeni fixture'ların oyuncu istatistiklerini eş zamanlı çek (API-Football
  // client'ı kendi içinde eş zamanlı istek sayısını sınırlıyor, bkz.
  // lib/api-football-client.ts MAX_CONCURRENT).
  const statsResults = await Promise.all(
    newFixtures.map(async (fixture) => ({ fixture, stats: await getFixturePlayerStats(fixture.id) })),
  )

  // Bu koşuda toplanan performansları oyuncu bazında grupla (bir oyuncu aynı
  // gün içinde nadiren birden fazla maça çıkabilir — örn. art arda kupa maçı).
  const performancesByPlayer = new Map<number, { teamId: number; perf: MatchPerformance }[]>()

  for (const { fixture, stats } of statsResults) {
    if (stats.length === 0) {
      // Tüm yeniden denemeler tükendi (safeFetch best-effort []) — bu
      // fixture'ı işlenmiş İŞARETLEME, bir sonraki günün cron'u (hâlâ
      // LOOKBACK_DAYS penceresindeyse) tekrar dener.
      continue
    }

    for (const s of stats) {
      if (!s.player.id || s.minutes === null || s.minutes <= 0) continue
      const perf: MatchPerformance = {
        fixtureId: fixture.id,
        teamId: s.teamId,
        teamName: s.team,
        date: fixture.date,
        rating: s.rating !== null ? Number.parseFloat(s.rating) : null,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        minutes: s.minutes,
      }
      const list = performancesByPlayer.get(s.player.id) ?? []
      list.push({ teamId: s.teamId, perf })
      performancesByPlayer.set(s.player.id, list)
    }

    await markFixtureProcessed(fixture.id)
    result.fixturesProcessed++
  }

  if (performancesByPlayer.size === 0) return result

  // 4. Bu koşuda etkilenen oyuncuların piyasa değerini ve mevcut güç
  // satırlarını toplu oku.
  const playerIds = Array.from(performancesByPlayer.keys())
  const [marketValueRows, existingPowerRows] = await Promise.all([
    db
      .select({ playerId: playerMarketValue.playerId, valueEur: playerMarketValue.valueEur })
      .from(playerMarketValue)
      .where(inArray(playerMarketValue.playerId, playerIds)),
    db.select().from(playerPower).where(inArray(playerPower.playerId, playerIds)),
  ])
  const marketValueMap = new Map(marketValueRows.map((r) => [r.playerId, r.valueEur !== null ? Number(r.valueEur) : null]))
  const existingPowerMap = new Map(existingPowerRows.map((r) => [r.playerId, r]))

  const season = currentSeason()
  const now = new Date()

  for (const [playerId, entries] of performancesByPlayer) {
    const existing = existingPowerMap.get(playerId) ?? null
    const sameSeason = existing !== null && existing.seasonYear === season
    const valueEur = marketValueMap.get(playerId) ?? null

    // Sezon değiştiyse (Ağustos geçişi) biriken rating ve form geçmişi sıfırlanır.
    let seasonRatingSum = sameSeason ? Number(existing!.seasonRatingSum) : 0
    let seasonRatingCount = sameSeason ? existing!.seasonRatingCount : 0
    let recentMatches: MatchPerformance[] = sameSeason ? ((existing!.recentMatches as MatchPerformance[]) ?? []) : []

    let teamId = existing?.teamId ?? null
    for (const { teamId: entryTeamId, perf } of entries) {
      teamId = entryTeamId
      if (perf.rating !== null) {
        seasonRatingSum += perf.rating
        seasonRatingCount += 1
      }
      recentMatches = addMatchToRecent(recentMatches, perf)
    }

    const basePower = computeBasePower({ valueEur, seasonRatingSum, seasonRatingCount })
    const formModifier = computeFormModifier(recentMatches)
    const currentPower = computeCurrentPower(basePower, formModifier)
    const marketPower = marketPowerFromValue(valueEur)

    const id = `player-power-${playerId}`
    await db
      .insert(playerPower)
      .values({
        id,
        playerId,
        teamId,
        marketPower,
        seasonYear: season,
        seasonRatingSum: String(seasonRatingSum),
        seasonRatingCount,
        basePower,
        formModifier,
        currentPower,
        recentMatches,
        lastFormUpdateAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: playerPower.playerId,
        set: {
          teamId,
          marketPower,
          seasonYear: season,
          seasonRatingSum: String(seasonRatingSum),
          seasonRatingCount,
          basePower,
          formModifier,
          currentPower,
          recentMatches,
          lastFormUpdateAt: now,
          updatedAt: now,
        },
      })

    result.playersUpdated++
  }

  return result
}

async function markFixtureProcessed(fixtureId: number): Promise<void> {
  await db.insert(playerPowerProcessedFixture).values({ id: `fixture-${fixtureId}`, fixtureId }).onConflictDoNothing()
}
