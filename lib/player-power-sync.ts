import { db } from "./db"
import { playerPower, playerPowerProcessedFixture, playerMarketValue } from "./db/schema"
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"
import { getFixturesByDate, getFixturePlayerStats, currentSeason } from "./api-football"
import { FEATURED_LEAGUE_IDS } from "./leagues"
import type { FixturePlayerStat, Fixture } from "./types"
import { computeBasePower, marketPowerFromValue, type PlayerMatchRating } from "./player-power"

// ---------------------------------------------------------------------------
// Günlük cron'un çağırdığı yazma (write) katmanı. API-Football'dan son
// LOOKBACK_DAYS gündeki biten maçları (takip edilen 24 lige filtrelenmiş)
// tarar, her yeni (henüz işlenmemiş) fixture için oyuncu istatistiklerini
// çeker ve player_power tablosunu upsert eder. Uygulamanın okuma tarafı
// (players/search route'u) bu tabloyu sadece OKUR, bu dosyayı asla import
// etmez — bkz. lib/player-power.ts (saf skorlama fonksiyonları).
//
// Bu dosyadaki `extractPerformancesFromFixture` ve `applyPerformances`
// yardımcı fonksiyonları, tam-sezon backfill'i tarafından da (bkz.
// lib/player-power-backfill.ts) paylaşılır — tek bir fixture'ın istatistik
// çıkarımı ve DB upsert mantığı iki yerde ayrı ayrı bakım gerektirmez.
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

/** Bir fixture'ın oyuncu istatistiklerinden, oyuncu bazlı PlayerMatchRating listesi çıkarır. */
export function extractPerformancesFromFixture(
  fixture: Fixture,
  stats: FixturePlayerStat[],
): Map<number, { teamId: number; perf: PlayerMatchRating }[]> {
  const performancesByPlayer = new Map<number, { teamId: number; perf: PlayerMatchRating }[]>()

  for (const s of stats) {
    if (!s.player.id || s.minutes === null || s.minutes <= 0) continue
    const perf: PlayerMatchRating = {
      rating: s.rating !== null ? Number.parseFloat(s.rating) : null,
    }
    const list = performancesByPlayer.get(s.player.id) ?? []
    list.push({ teamId: s.teamId, perf })
    performancesByPlayer.set(s.player.id, list)
  }

  return performancesByPlayer
}

/**
 * Bir veya daha fazla fixture'dan biriken oyuncu bazlı performansları
 * player_power tablosuna upsert eder. Her oyuncu için mevcut satır (varsa)
 * okunup sezon rating toplamı/sayısı ve son maçlar listesi üzerine eklenir.
 *
 * basePower (marketPower + sezon rating ortalaması) sabittir; günlük
 * performansa göre değişen bir form/momentum katmanı yoktur —
 * currentPower = basePower (bkz. lib/player-power.ts computeCurrentPower()).
 */
export async function applyPerformances(
  performancesByPlayer: Map<number, { teamId: number; perf: PlayerMatchRating }[]>,
  season: number,
): Promise<number> {
  if (performancesByPlayer.size === 0) return 0

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

  const now = new Date()
  let playersUpdated = 0

  for (const [playerId, entries] of performancesByPlayer) {
    const existing = existingPowerMap.get(playerId) ?? null
    const sameSeason = existing !== null && existing.seasonYear === season
    const valueEur = marketValueMap.get(playerId) ?? null

    // Sezon değiştiyse (Ağustos geçişi) biriken rating sıfırlanır.
    let seasonRatingSum = sameSeason ? Number(existing!.seasonRatingSum) : 0
    let seasonRatingCount = sameSeason ? existing!.seasonRatingCount : 0

    let teamId = existing?.teamId ?? null
    for (const { teamId: entryTeamId, perf } of entries) {
      teamId = entryTeamId
      if (perf.rating !== null) {
        seasonRatingSum += perf.rating
        seasonRatingCount += 1
      }
    }

    const basePower = computeBasePower({ valueEur, seasonRatingSum, seasonRatingCount })
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
          updatedAt: now,
        },
      })

    playersUpdated++
  }

  return playersUpdated
}

/**
 * Admin'in "Oyuncu Güçlerini Sıfırla" butonu — mevcut TÜM `player_power`
 * satırlarını SİLMEZ, tüm güç alanlarını (marketPower/basePower/
 * currentPower/formModifier/seasonRatingSum/seasonRatingCount/recentMatches)
 * literal 0'a çeker. Satırları silmek YERİNE üstüne yazmayı seçtik çünkü
 * okuma tarafı (app/api/games/manager-career/players/search/route.ts)
 * `currentPower ?? computeLivePowerFromMarketValue(...)` deseni kullanıyor —
 * `??` sadece null/undefined'da fallback'e düşer, 0 DÜŞMEZ. Yani satır
 * silinseydi arama ekranı piyasa değerinden anlık hesaplanan bir güç
 * gösterirdi, admin'in istediği "hepsi 0 görünsün" davranışı SİLİNEREK
 * elde edilemez, sadece 0'a güncellenerek elde edilir.
 *
 * `player_power_processed_fixture` kaydına DOKUNMAZ — bu sadece "bu fixture
 * zaten işlendi" işaretidir, sıfırlamayla ilgisizdir ve silinirse günlük
 * cron aynı maçları tekrar tekrar işlemeye çalışır.
 */
export async function resetAllPlayerPowerData(): Promise<{ resetCount: number }> {
  const now = new Date()
  const updated = await db
    .update(playerPower)
    .set({
      marketPower: 0,
      seasonRatingSum: "0",
      seasonRatingCount: 0,
      basePower: 0,
      updatedAt: now,
    })
    .returning({ id: playerPower.id })

  return { resetCount: updated.length }
}

/**
 * Admin'in "Yeniden Hesapla" butonu — mevcut TÜM `player_power` satırlarının
 * marketPower/basePower/currentPower'ını, GÜNCEL piyasa değeri
 * (player_market_value) ve o satırda halihazırda biriken seasonRatingSum/
 * Count kullanılarak baştan hesaplar ve DOĞRUDAN ÜSTÜNE YAZAR (örn. 90 -> 91).
 * Sıfırlanmış (hepsi 0) bir satırda seasonRatingCount de 0 olduğu için bu
 * satırlar için sonuç doğal olarak sadece marketPower'a eşit çıkar — yani bu
 * fonksiyon "Sıfırla"dan önce veya sonra çalıştırılsa da fark etmeden aynı
 * mantıkla üstüne yazar.
 *
 * ÖNEMLİ: bu, tam-sezon backfill'den (lib/player-power-backfill.ts) FARKLI
 * bir işlemdir — backfill API-Football'dan YENİ fixture istatistikleri çeker
 * (yavaş, zincirleme); bu fonksiyon ise SADECE zaten DB'de olan veriden
 * (piyasa değeri + birikmiş rating) mevcut formülle yeniden hesaplar (hızlı,
 * tek seferde biter, dış API çağrısı yapmaz) — bkz. scripts/recompute-
 * player-power.mjs (aynı mantığın tek seferlik CLI script hali).
 */
export async function recomputeAllPlayerPowerData(): Promise<{ updated: number }> {
  const rows = await db
    .select({
      playerId: playerPower.playerId,
      seasonRatingSum: playerPower.seasonRatingSum,
      seasonRatingCount: playerPower.seasonRatingCount,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerPower)
    .leftJoin(playerMarketValue, eq(playerMarketValue.playerId, playerPower.playerId))

  if (rows.length === 0) return { updated: 0 }

  // Tek tek await edilen 2500+ UPDATE round-trip'i yerine, her par��ada tek bir
  // SQL sorgusuyla (VALUES listesi + UPDATE...FROM) toplu güncelleme yapılır —
  // hem çok daha hızlı hem de bir server action'ın zaman bütçesini zorlamaz.
  const CHUNK_SIZE = 500
  let updated = 0

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const valueTuples = chunk.map((r) => {
      const valueEur = r.valueEur !== null ? Number(r.valueEur) : null
      const seasonRatingSum = Number(r.seasonRatingSum)
      const seasonRatingCount = r.seasonRatingCount
      const marketPower = marketPowerFromValue(valueEur)
      const basePower = computeBasePower({ valueEur, seasonRatingSum, seasonRatingCount })
      return sql`(${r.playerId}, ${marketPower}, ${basePower})`
    })

    await db.execute(sql`
      update player_power as pp
      set
        "marketPower" = v.market_power::int,
        "basePower" = v.base_power::int,
        "updatedAt" = now()
      from (values ${sql.join(valueTuples, sql`, `)}) as v(player_id, market_power, base_power)
      where pp."playerId" = v.player_id::int
    `)

    updated += chunk.length
  }

  return { updated }
}

/**
 * `applyPerformances` bir oyuncunun sezon rating birikimini sadece o oyuncu
 * YENİ bir maça çıktığında sıfırlar (bkz. `sameSeason` kontrolü orada). Sezon
 * değiştiğinde (Ağustos geçişi) henüz maça çıkmamış oyuncuların satırı hiç
 * dokunulmadığı için eski sezonun `seasonYear`/`seasonRatingSum`/Count'u
 * kalıcı olarak DB'de kalır ve basePower'a sızmaya devam eder.
 *
 * Bu fonksiyon, cron her çalıştığında ÖNCE çalışarak eski sezona ait tüm
 * satırları proaktif olarak sıfırlar: seasonYear günceli, seasonRatingSum/
 * Count/recentMatches boşa alınır, basePower/currentPower da (rating artık
 * yok) doğrudan marketPower'a eşitlenir — computeBasePower'ın rating
 * count=0 durumunda üreteceği sonuçla birebir aynıdır.
 */
export async function resetStaleSeasonRows(season: number): Promise<number> {
  const now = new Date()
  const updated = await db
    .update(playerPower)
    .set({
      seasonYear: season,
      seasonRatingSum: "0",
      seasonRatingCount: 0,
      basePower: sql`${playerPower.marketPower}`,
      updatedAt: now,
    })
    .where(and(isNotNull(playerPower.seasonYear), ne(playerPower.seasonYear, season)))
    .returning({ playerId: playerPower.playerId })

  return updated.length
}

export async function runPlayerPowerSync(): Promise<PlayerPowerSyncResult> {
  const result: PlayerPowerSyncResult = { fixturesScanned: 0, fixturesProcessed: 0, playersUpdated: 0 }

  // 0. Sezon değişmişse (Ağustos geçişi), henüz bu sezon maça çıkmadığı için
  // applyPerformances'a hiç uğramayacak eski satırları proaktif sıfırla.
  await resetStaleSeasonRows(currentSeason())

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
  const performancesByPlayer = new Map<number, { teamId: number; perf: PlayerMatchRating }[]>()

  for (const { fixture, stats } of statsResults) {
    if (stats.length === 0) {
      // Tüm yeniden denemeler tükendi (safeFetch best-effort []) — bu
      // fixture'ı işlenmiş İŞARETLEME, bir sonraki günün cron'u (hâlâ
      // LOOKBACK_DAYS penceresindeyse) tekrar dener.
      continue
    }

    const extracted = extractPerformancesFromFixture(fixture, stats)
    for (const [playerId, entries] of extracted) {
      const list = performancesByPlayer.get(playerId) ?? []
      list.push(...entries)
      performancesByPlayer.set(playerId, list)
    }

    await markFixtureProcessed(fixture.id)
    result.fixturesProcessed++
  }

  const season = currentSeason()
  result.playersUpdated = await applyPerformances(performancesByPlayer, season)

  return result
}

export async function markFixtureProcessed(fixtureId: number): Promise<void> {
  await db.insert(playerPowerProcessedFixture).values({ id: `fixture-${fixtureId}`, fixtureId }).onConflictDoNothing()
}
