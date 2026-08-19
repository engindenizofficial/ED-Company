import { desc, eq, inArray } from "drizzle-orm"
import { db } from "./db"
import { playerPowerBackfillCronRun, playerPowerProcessedFixture } from "./db/schema"
import { getFixturesByLeagueSeason, getFixturePlayerStats, currentSeason } from "./api-football"
import { FEATURED_LEAGUE_IDS } from "./leagues"
import {
  extractPerformancesFromFixture,
  applyPerformances,
  markFixtureProcessed,
  resetStaleSeasonRows,
} from "./player-power-sync"
import type { MatchPerformance } from "./player-power"

// ---------------------------------------------------------------------------
// Tam-sezon güç backfill'i. Günlük cron (lib/player-power-sync.ts) sadece son
// 2 günü tarar; bu modül `player_power`/`player_position` tabloları tamamen
// sıfırlandığında (veya ilk kurulumda) TÜM sezonu, 24 takip edilen ligin
// (bkz. lib/leagues.ts FEATURED_LEAGUE_IDS) her birini sırayla tarayarak
// yeniden inşa eder.
//
// `backfill-player-positions` route'undaki zincirleme (`after()` ile kendini
// tetikleyen) desenin aynısını izler — ilerleme burada lig index'i +
// lig-içi fikstür index'i olarak `player_power_backfill_cron_run` satırında
// kalıcı tutulur, böylece zincir kesilse (deploy, zaman aşımı, ağ hatası)
// bile bir sonraki tetikleme kaldığı yerden devam eder.
//
// Bir oyuncunun `recentMatches`/`seasonRatingSum` biriktirme mantığı
// (bkz. lib/player-power-sync.ts applyPerformances) EKLEME-SIRALAMASINDAN
// BAĞIMSIZDIR: `addMatchToRecent` her ekte tarihe göre yeniden sıralayıp son
// 8'e kırpar, `seasonRatingSum/Count` ise basit bir toplamdır. Bu sayede
// ligler birbirinden bağımsız, herhangi bir sırada taranabilir — sonuç,
// tüm fikstürler işlendiğinde her zaman doğru "gerçek son 8 maç" ve doğru
// sezon rating ortalamasına yakınsar.
// ---------------------------------------------------------------------------

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"])

/** Her çağrıda işlenecek fikstür sayısı — maxDuration penceresine güvenle sığar. */
const FIXTURE_BATCH_SIZE = 25

export interface PowerBackfillBatchResult {
  done: boolean
  activeLeagueId: number | null
  fixturesProcessed: number
  playersUpdated: number
  currentLeagueIndex: number
  currentFixtureIndex: number
  totalFixturesProcessed: number
  totalPlayersUpdated: number
}

async function getOrCreateRunningProgress(season: number) {
  const existing = await db
    .select()
    .from(playerPowerBackfillCronRun)
    .where(eq(playerPowerBackfillCronRun.status, "running"))
    .orderBy(desc(playerPowerBackfillCronRun.createdAt))
    .limit(1)

  if (existing.length > 0) return existing[0]

  // Yeni bir backfill koşusu başlıyor — eski sezona ait, henüz bu sezon
  // hiç maça çıkmamış oyuncuların satırlarını proaktif sıfırla (bkz.
  // lib/player-power-sync.ts resetStaleSeasonRows).
  await resetStaleSeasonRows(season)

  const id = `player-power-backfill-run-${Date.now()}`
  const now = new Date()
  await db.insert(playerPowerBackfillCronRun).values({
    id,
    runStartedAt: now,
    status: "running",
    currentLeagueIndex: 0,
    currentFixtureIndex: 0,
  })
  const inserted = await db.select().from(playerPowerBackfillCronRun).where(eq(playerPowerBackfillCronRun.id, id))
  return inserted[0]
}

/**
 * Bir adım: sıradaki (en fazla FIXTURE_BATCH_SIZE) fikstürü, gerekirse birden
 * fazla ligden devam ederek işler. Zaten `player_power_processed_fixture`'da
 * olan fikstürler atlanır (aynı fixture'ın iki kez forma eklenmesini önler —
 * örn. bu koşu daha önce kısmen çalışıp kesilmişse).
 */
export async function runPlayerPowerBackfillBatch(): Promise<PowerBackfillBatchResult> {
  const season = currentSeason()
  const progress = await getOrCreateRunningProgress(season)

  let currentLeagueIndex = progress.currentLeagueIndex
  let currentFixtureIndex = progress.currentFixtureIndex
  let fixturesProcessedThisCall = 0
  let activeLeagueId: number | null = null
  const performancesByPlayer = new Map<number, { teamId: number; perf: MatchPerformance }[]>()

  while (fixturesProcessedThisCall < FIXTURE_BATCH_SIZE) {
    if (currentLeagueIndex >= FEATURED_LEAGUE_IDS.length) {
      break // tüm ligler tamamlandı
    }

    const leagueId = FEATURED_LEAGUE_IDS[currentLeagueIndex]
    activeLeagueId = leagueId

    const fixtures = (await getFixturesByLeagueSeason(leagueId, season))
      .filter((f) => FINISHED_STATUSES.has(f.statusShort))
      .sort((a, b) => a.timestamp - b.timestamp)

    if (fixtures.length === 0 || currentFixtureIndex >= fixtures.length) {
      // Bu lig bitti (veya hiç biten maçı yok) — sıradaki lige geç.
      currentLeagueIndex++
      currentFixtureIndex = 0
      continue
    }

    const remainingBudget = FIXTURE_BATCH_SIZE - fixturesProcessedThisCall
    const endIndex = Math.min(fixtures.length, currentFixtureIndex + remainingBudget)
    const slice = fixtures.slice(currentFixtureIndex, endIndex)

    const processedRows = await db
      .select({ fixtureId: playerPowerProcessedFixture.fixtureId })
      .from(playerPowerProcessedFixture)
      .where(inArray(playerPowerProcessedFixture.fixtureId, slice.map((f) => f.id)))
    const processedSet = new Set(processedRows.map((r) => r.fixtureId))
    const toFetch = slice.filter((f) => !processedSet.has(f.id))

    const statsResults = await Promise.all(
      toFetch.map(async (fixture) => ({ fixture, stats: await getFixturePlayerStats(fixture.id) })),
    )

    for (const { fixture, stats } of statsResults) {
      if (stats.length === 0) {
        // safeFetch best-effort [] döndü (geçici API hatası/rate limit) —
        // bu fixture "işlenmiş" işaretlenmez, ama backfill kalıcı olarak
        // ilerlediği için bir sonraki koşuda tekrar denenmeyecek (cursor
        // ileri gider). Kabul edilebilir: nadir görülen bir edge case,
        // günlük cron zaten yeni maçlarda aynı sorunu LOOKBACK_DAYS ile telafi ediyor.
        continue
      }
      const extracted = extractPerformancesFromFixture(fixture, stats)
      for (const [playerId, entries] of extracted) {
        const list = performancesByPlayer.get(playerId) ?? []
        list.push(...entries)
        performancesByPlayer.set(playerId, list)
      }
      await markFixtureProcessed(fixture.id)
    }

    fixturesProcessedThisCall += slice.length
    currentFixtureIndex = endIndex
  }

  const playersUpdatedThisCall = await applyPerformances(performancesByPlayer, season)

  const done = currentLeagueIndex >= FEATURED_LEAGUE_IDS.length
  const now = new Date()
  const totalFixturesProcessed = progress.fixturesProcessed + fixturesProcessedThisCall
  const totalPlayersUpdated = progress.playersUpdated + playersUpdatedThisCall

  await db
    .update(playerPowerBackfillCronRun)
    .set({
      status: done ? "completed" : "running",
      runFinishedAt: done ? now : undefined,
      currentLeagueIndex,
      currentFixtureIndex,
      fixturesProcessed: totalFixturesProcessed,
      playersUpdated: totalPlayersUpdated,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(playerPowerBackfillCronRun.id, progress.id))

  return {
    done,
    activeLeagueId,
    fixturesProcessed: fixturesProcessedThisCall,
    playersUpdated: playersUpdatedThisCall,
    currentLeagueIndex,
    currentFixtureIndex,
    totalFixturesProcessed,
    totalPlayersUpdated,
  }
}
