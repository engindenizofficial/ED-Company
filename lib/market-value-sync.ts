import { db } from "./db"
import { teamMarketValue, playerMarketValue, marketValueReviewQueue } from "./db/schema"
import { eq, inArray, lt, and, or } from "drizzle-orm"
import { scrapeLeagueTeams, scrapeTeamSquad, scrapeTeamCountry, scrapePlayerNationality, SCRAPABLE_LEAGUE_IDS } from "./transfermarkt-scraper"
import { getLeagueTeamsForMatching, matchTeams, matchPlayersForTeam } from "./market-value-matcher"
import { getTeamCountry, getPlayerNationality } from "./api-football"

// ---------------------------------------------------------------------------
// Cron job'ın çağırdığı yazma (write) katmanı. Scrape + eşleştirme sonuçlarını
// veritabanına upsert eder. Uygulamanın okuma tarafı (lib/market-values.ts,
// 6. adımda eklenecek) bu tabloları sadece okur — bu dosyayı asla import etmez.
// ---------------------------------------------------------------------------

/** API-Football sezon numarasını döndürür (Ağustos'tan itibaren yeni sezon). */
function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface LockedRow {
  matchStatus: "matched" | "review" | "unmatched"
  transfermarktId: string | null
}

/**
 * Admin tarafından manuel onaylanmış/reddedilmiş (manualOverride = true) takım
 * satırlarını okur. Bu takımlar için cron, isim benzerliğini yeniden hesaplasa
 * bile matchStatus/transfermarktTeamId üzerine YAZMAZ — admin kararı kalıcıdır.
 */
async function getLockedTeamMap(teamIds: number[]): Promise<Map<number, LockedRow>> {
  const result = new Map<number, LockedRow>()
  if (teamIds.length === 0) return result

  const rows = await db
    .select({
      teamId: teamMarketValue.teamId,
      matchStatus: teamMarketValue.matchStatus,
      transfermarktTeamId: teamMarketValue.transfermarktTeamId,
      manualOverride: teamMarketValue.manualOverride,
    })
    .from(teamMarketValue)
    .where(inArray(teamMarketValue.teamId, teamIds))

  for (const row of rows) {
    if (!row.manualOverride) continue
    result.set(row.teamId, {
      matchStatus: row.matchStatus as LockedRow["matchStatus"],
      transfermarktId: row.transfermarktTeamId,
    })
  }
  return result
}

/** Oyuncular için aynı kilit mantığı — bkz. getLockedTeamMap. */
async function getLockedPlayerMap(playerIds: number[]): Promise<Map<number, LockedRow>> {
  const result = new Map<number, LockedRow>()
  if (playerIds.length === 0) return result

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      matchStatus: playerMarketValue.matchStatus,
      transfermarktPlayerId: playerMarketValue.transfermarktPlayerId,
      manualOverride: playerMarketValue.manualOverride,
    })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.playerId, playerIds))

  for (const row of rows) {
    if (!row.manualOverride) continue
    result.set(row.playerId, {
      matchStatus: row.matchStatus as LockedRow["matchStatus"],
      transfermarktId: row.transfermarktPlayerId,
    })
  }
  return result
}

interface PlayerSyncCounts {
  matched: number
  review: number
  unmatched: number
}

/**
 * Bir takımın kadrosunu Transfermarkt'tan çekip oyuncuları eşleştirir ve
 * yazar. Admin tarafından manuel kilitlenmiş (manualOverride) oyuncu
 * satırlarına dokunmaz — onların kararı sabit sayılır.
 */
async function syncTeamPlayers(
  apiFootballTeamId: number,
  transfermarktTeamId: string,
  season: number,
  runStartedAt: Date,
): Promise<PlayerSyncCounts> {
  const counts: PlayerSyncCounts = { matched: 0, review: 0, unmatched: 0 }

  // Transfermarkt'a art arda çok hızlı istek atmamak için takımlar arası
  // küçük bir bekleme (rate-limit / 503 riskini azaltır).
  await sleep(700)
  let scrapedPlayers = await scrapeTeamSquad(transfermarktTeamId)
  if (scrapedPlayers.length === 0) {
    // Geçici bir rate-limit (503) olabilir — biraz daha bekleyip bir kez tekrar dene.
    await sleep(2000)
    scrapedPlayers = await scrapeTeamSquad(transfermarktTeamId)
  }
  if (scrapedPlayers.length === 0) return counts

  const playerMatches = await matchPlayersForTeam(apiFootballTeamId, scrapedPlayers)
  const playerIds = playerMatches.map((pm) => pm.apiFootballPlayerId)
  const lockedPlayers = await getLockedPlayerMap(playerIds)

  // Bu takımın kadrosunda API-Football tarafında hâlâ görünen HER oyuncuyu
  // "var" olarak işaretle — kilitli olsun ya da olmasın. Bir oyuncu transfer
  // olup başka bir (taranan) takıma geçtiğinde, o takımın senkronu sırasında
  // burada tekrar "görülecek" ve lastSeenAt tazelenecek; hiçbir taranan
  // takımın kadrosunda artık görünmüyorsa (transfer dışı lig, emeklilik vb.)
  // bu satır dokunulmadan kalır ve temizlik adımında silinir.
  if (playerIds.length > 0) {
    await db
      .update(playerMarketValue)
      .set({ lastSeenAt: runStartedAt })
      .where(inArray(playerMarketValue.playerId, playerIds))
  }

  for (const pm of playerMatches) {
    const locked = lockedPlayers.get(pm.apiFootballPlayerId)
    if (locked) {
      // Admin bu oyuncu için kararını vermiş — cron üzerine yazmaz, sadece sayar.
      if (locked.matchStatus === "matched") counts.matched++
      else counts.unmatched++
      continue
    }

    await upsertPlayerMarketValue(apiFootballTeamId, pm, runStartedAt)

    if (pm.status === "unmatched") {
      counts.unmatched++
      continue
    }
    if (pm.status === "review") {
      counts.review++
      const [entityCountry, candidateCountry] = await Promise.all([
        getPlayerNationality(pm.apiFootballPlayerId, season),
        pm.transfermarktPlayerId ? scrapePlayerNationality(pm.transfermarktPlayerId) : Promise.resolve(null),
      ])
      await upsertReviewQueueEntry({
        entityType: "player",
        entityId: pm.apiFootballPlayerId,
        entityName: pm.apiFootballPlayerName,
        entityCountry,
        candidateName: pm.transfermarktPlayerName,
        candidateTransfermarktId: pm.transfermarktPlayerId,
        candidateCountry,
        candidateValueEur: pm.valueEur,
        confidence: pm.confidence,
      })
      continue
    }
    counts.matched++
  }

  return counts
}

/**
 * Bir ligin takım + oyuncu piyasa değerlerini scrape edip DB'ye yazar.
 *
 * @param runStartedAt Bu haftalık cron döngüsünün başladığı an (23 ligin
 * hepsinde AYNI değer kullanılır — bkz. app/api/cron/update-market-values).
 * Her görülen takım/oyuncu satırının lastSeenAt'i bu değere set edilir;
 * döngü sonunda lastSeenAt < runStartedAt olan satırlar "artık görülmedi"
 * (ligden düşmüş takım, transfer olmuş oyuncu vb.) sayılıp temizlenir.
 */
export async function syncLeagueMarketValues(leagueId: number, runStartedAt: Date): Promise<{
  leagueId: number
  teamsMatched: number
  teamsReview: number
  teamsUnmatched: number
  playersMatched: number
  playersReview: number
  playersUnmatched: number
}> {
  const season = currentSeason()

  const [apiFootballTeams, scrapedTeams] = await Promise.all([
    getLeagueTeamsForMatching(leagueId, season),
    scrapeLeagueTeams(leagueId),
  ])

  const teamMatches = matchTeams(apiFootballTeams, scrapedTeams)
  const teamIds = teamMatches.map((tm) => tm.apiFootballTeamId)

  // Admin tarafından manuel onaylanmış/reddedilmiş takımları önceden oku —
  // bu takımların isim benzerliği bu hafta hâlâ eşik altında çıksa bile
  // kararları bozulmayacak (bkz. syncTeamPlayers / getLockedTeamMap).
  const lockedTeams = await getLockedTeamMap(teamIds)

  // Bu ligin standings'inde API-Football tarafında hâlâ görünen HER takımı
  // "var" olarak işaretle — kilitli olsun ya da olmasın (bkz. syncTeamPlayers
  // içindeki aynı mantık, oyuncular için).
  if (teamIds.length > 0) {
    await db.update(teamMarketValue).set({ lastSeenAt: runStartedAt }).where(inArray(teamMarketValue.teamId, teamIds))
  }

  let teamsMatched = 0
  let teamsReview = 0
  let teamsUnmatched = 0
  let playersMatched = 0
  let playersReview = 0
  let playersUnmatched = 0

  for (const tm of teamMatches) {
    const locked = lockedTeams.get(tm.apiFootballTeamId)

    if (locked) {
      // Bu takımın eşleşmesi admin tarafından sabitlendi — matchStatus/
      // transfermarktTeamId üzerine yazılmaz, review kuyruğuna da düşürülmez.
      if (locked.matchStatus !== "matched" || !locked.transfermarktId) {
        teamsUnmatched++
        continue
      }
      teamsMatched++
      const counts = await syncTeamPlayers(tm.apiFootballTeamId, locked.transfermarktId, season, runStartedAt)
      playersMatched += counts.matched
      playersReview += counts.review
      playersUnmatched += counts.unmatched
      continue
    }

    await upsertTeamMarketValue(leagueId, tm, runStartedAt)

    if (tm.status === "unmatched") {
      teamsUnmatched++
      continue
    }
    if (tm.status === "review") {
      teamsReview++
      // Belirsiz eşleşmede admin'e karşılaştırma imkanı vermek için her iki
      // taraftan da menşei ülkesini çekiyoruz — sadece review'a düşen az
      // sayıda kayıt için, otomatik eşleşenlerde bu ek isteklere gerek yok.
      const [entityCountry, candidateCountry] = await Promise.all([
        getTeamCountry(tm.apiFootballTeamId),
        tm.transfermarktTeamId ? scrapeTeamCountry(tm.transfermarktTeamId) : Promise.resolve(null),
      ])
      await upsertReviewQueueEntry({
        entityType: "team",
        entityId: tm.apiFootballTeamId,
        entityName: tm.apiFootballTeamName,
        entityCountry,
        candidateName: tm.transfermarktTeamName,
        candidateTransfermarktId: tm.transfermarktTeamId,
        candidateCountry,
        candidateValueEur: tm.totalValueEur,
        confidence: tm.confidence,
      })
      // Belirsiz takım eşleşmesinde oyuncu aramasına girmiyoruz — yanlış
      // takımın kadrosuyla eşleştirme yapıp hatalı veri üretmemek için.
      continue
    }

    teamsMatched++

    // Takım eşleşti (status === "matched") — kadroyu çek ve oyuncuları eşleştir.
    if (!tm.transfermarktTeamId) continue
    const counts = await syncTeamPlayers(tm.apiFootballTeamId, tm.transfermarktTeamId, season, runStartedAt)
    playersMatched += counts.matched
    playersReview += counts.review
    playersUnmatched += counts.unmatched
  }

  return { leagueId, teamsMatched, teamsReview, teamsUnmatched, playersMatched, playersReview, playersUnmatched }
}

async function upsertTeamMarketValue(
  leagueId: number,
  tm: Awaited<ReturnType<typeof matchTeams>>[number],
  runStartedAt: Date,
): Promise<void> {
  const id = `team-${tm.apiFootballTeamId}`
  const now = new Date()

  await db
    .insert(teamMarketValue)
    .values({
      id,
      teamId: tm.apiFootballTeamId,
      leagueId,
      teamName: tm.apiFootballTeamName,
      transfermarktTeamId: tm.transfermarktTeamId,
      transfermarktTeamSlug: null,
      totalValueEur: tm.totalValueEur !== null ? String(tm.totalValueEur) : null,
      matchConfidence: tm.confidence,
      matchStatus: tm.status,
      lastScrapedAt: now,
      lastSeenAt: runStartedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamMarketValue.teamId,
      set: {
        leagueId,
        teamName: tm.apiFootballTeamName,
        transfermarktTeamId: tm.transfermarktTeamId,
        totalValueEur: tm.totalValueEur !== null ? String(tm.totalValueEur) : null,
        matchConfidence: tm.confidence,
        matchStatus: tm.status,
        lastScrapedAt: now,
        lastSeenAt: runStartedAt,
        updatedAt: now,
      },
    })
}

async function upsertPlayerMarketValue(
  teamId: number,
  pm: Awaited<ReturnType<typeof matchPlayersForTeam>>[number],
  runStartedAt: Date,
): Promise<void> {
  const id = `player-${pm.apiFootballPlayerId}`
  const now = new Date()

  await db
    .insert(playerMarketValue)
    .values({
      id,
      playerId: pm.apiFootballPlayerId,
      teamId,
      playerName: pm.apiFootballPlayerName,
      transfermarktPlayerId: pm.transfermarktPlayerId,
      transfermarktPlayerSlug: null,
      valueEur: pm.valueEur !== null ? String(pm.valueEur) : null,
      matchConfidence: pm.confidence,
      matchStatus: pm.status,
      lastScrapedAt: now,
      lastSeenAt: runStartedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: playerMarketValue.playerId,
      set: {
        teamId,
        playerName: pm.apiFootballPlayerName,
        transfermarktPlayerId: pm.transfermarktPlayerId,
        valueEur: pm.valueEur !== null ? String(pm.valueEur) : null,
        matchConfidence: pm.confidence,
        matchStatus: pm.status,
        lastScrapedAt: now,
        lastSeenAt: runStartedAt,
        updatedAt: now,
      },
    })
}

interface ReviewEntryInput {
  entityType: "team" | "player"
  entityId: number
  entityName: string
  entityCountry: string | null
  candidateName: string | null
  candidateTransfermarktId: string | null
  candidateCountry: string | null
  candidateValueEur: number | null
  confidence: number
}

/**
 * Review kuyruğuna deterministik id (`${entityType}-${entityId}`) ile yazar,
 * böylece cron her çalıştığında aynı belirsiz eşleşme için kuyrukta sonsuz
 * çoğalma olmaz — kayıt güncellenir. Daha önce "approved"/"rejected" olarak
 * çözülmüş bir kayıt tekrar "pending"e dönmez (durum çözülmüşse dokunulmaz).
 */
async function upsertReviewQueueEntry(input: ReviewEntryInput): Promise<void> {
  const id = `${input.entityType}-${input.entityId}`
  const now = new Date()

  const existing = await db
    .select({ status: marketValueReviewQueue.status })
    .from(marketValueReviewQueue)
    .where(eq(marketValueReviewQueue.id, id))
    .limit(1)

  if (existing.length > 0 && existing[0].status !== "pending") {
    // Daha önce elle onaylanmış/reddedilmiş bir kayıt — cron üzerine yazmasın.
    return
  }

  await db
    .insert(marketValueReviewQueue)
    .values({
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      entityCountry: input.entityCountry,
      candidateName: input.candidateName,
      candidateTransfermarktId: input.candidateTransfermarktId,
      candidateCountry: input.candidateCountry,
      candidateValueEur: input.candidateValueEur !== null ? String(input.candidateValueEur) : null,
      confidence: input.confidence,
      status: "pending",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: marketValueReviewQueue.id,
      set: {
        entityName: input.entityName,
        entityCountry: input.entityCountry,
        candidateName: input.candidateName,
        candidateTransfermarktId: input.candidateTransfermarktId,
        candidateCountry: input.candidateCountry,
        candidateValueEur: input.candidateValueEur !== null ? String(input.candidateValueEur) : null,
        confidence: input.confidence,
        status: "pending",
      },
    })
}

export interface CleanupResult {
  skipped: boolean
  teamsDeleted: number
  playersDeleted: number
  reviewEntriesDeleted: number
}

/**
 * 23 ligin TÜMÜ bu haftalık cron döngüsünde hatasız işlendiyse çağrılır
 * (bkz. app/api/cron/update-market-values). "Hayalet" kayıtları temizler:
 *
 * - Bir takım artık takip edilen 23 ligden hiçbirinin standings'inde
 *   çıkmıyorsa (relegasyon, lig değişikliği, kulüp feshi vb.) o takımın
 *   satırının lastSeenAt'i bu döngüde hiç güncellenmemiştir.
 * - Bir oyuncu artık taranan hiçbir takımın kadrosunda görünmüyorsa
 *   (transfer, emeklilik, sözleşme feshi vb.) aynı şekilde geride kalır.
 *
 * Bu, admin'in manuel onayladığı (manualOverride) satırları da kapsar —
 * eşleşme kilitli olsa da varlığın kendisi artık gerçek değilse ghost kayıt
 * olarak silinir; kilit sadece "hâlâ var olan bir varlığın eşleşmesini
 * yeniden hesaplama" işlemini engeller, "artık var olmayan bir varlığı
 * sonsuza dek DB'de tutma" işlemini değil.
 *
 * hadErrors=true ise hiçbir şey silinmez — bu döngüde bir veya daha fazla
 * lig transient bir hata yüzünden atlanmış olabilir, bu da o ligin
 * takımlarının lastSeenAt'inin yanlışlıkla geride kalmasına (ve gerçek,
 * hâlâ aktif takımların silinmesine) yol açabilir. Bir dahaki hatasız
 * döngüye kadar beklemek daha güvenlidir.
 */
export async function cleanupStaleMarketValueRows(runStartedAt: Date, hadErrors: boolean): Promise<CleanupResult> {
  if (hadErrors) {
    console.log("[v0] Cron döngüsünde hata(lar) oluştu — hayalet kayıt temizliği bu hafta atlanıyor.")
    return { skipped: true, teamsDeleted: 0, playersDeleted: 0, reviewEntriesDeleted: 0 }
  }

  const staleTeams = await db
    .delete(teamMarketValue)
    .where(lt(teamMarketValue.lastSeenAt, runStartedAt))
    .returning({ teamId: teamMarketValue.teamId })

  const stalePlayers = await db
    .delete(playerMarketValue)
    .where(lt(playerMarketValue.lastSeenAt, runStartedAt))
    .returning({ playerId: playerMarketValue.playerId })

  let reviewEntriesDeleted = 0
  const staleTeamIds = staleTeams.map((t) => t.teamId)
  const stalePlayerIds = stalePlayers.map((p) => p.playerId)

  // Silinen varlıklara ait, henüz karar verilmemiş review kuyruğu kayıtlarını
  // da temizle — artık var olmayan bir takım/oyuncu için "onayla/reddet"
  // gösterilmesin.
  if (staleTeamIds.length > 0 || stalePlayerIds.length > 0) {
    const conditions = []
    if (staleTeamIds.length > 0) {
      conditions.push(and(eq(marketValueReviewQueue.entityType, "team"), inArray(marketValueReviewQueue.entityId, staleTeamIds)))
    }
    if (stalePlayerIds.length > 0) {
      conditions.push(and(eq(marketValueReviewQueue.entityType, "player"), inArray(marketValueReviewQueue.entityId, stalePlayerIds)))
    }
    const deleted = await db
      .delete(marketValueReviewQueue)
      .where(or(...conditions))
      .returning({ id: marketValueReviewQueue.id })
    reviewEntriesDeleted = deleted.length
  }

  console.log(
    `[v0] Hayalet kayıt temizliği tamamlandı: ${staleTeams.length} takım, ${stalePlayers.length} oyuncu, ${reviewEntriesDeleted} review kaydı silindi.`,
  )

  return {
    skipped: false,
    teamsDeleted: staleTeams.length,
    playersDeleted: stalePlayers.length,
    reviewEntriesDeleted,
  }
}

export { SCRAPABLE_LEAGUE_IDS }
