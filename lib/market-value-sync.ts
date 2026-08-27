import { db } from "./db"
import { leagueMarketValue, teamMarketValue, playerMarketValue, marketValueReviewQueue } from "./db/schema"
import { currentSeason, getTeamCountry, getLeagueBasicInfo } from "./api-football"
import { scrapeLeagueTeams, scrapeTeamSquad, scrapeTeamCountry, sleep, TM_REQUEST_DELAY_MS } from "./transfermarkt-scraper"
import {
  matchLeague,
  matchTeams,
  matchPlayersForTeam,
  getLeagueTeamsForMatching,
  type LeagueMatchResult,
  type TeamMatchResult,
  type PlayerMatchResult,
} from "./market-value-matcher"

// ---------------------------------------------------------------------------
// Cron zincirinin çağırdığı yazma (write) katmanı. Scrape + eşleştirme
// sonuçlarını veritabanına upsert eder. Uygulamanın okuma tarafı
// (lib/market-values.ts) bu tabloları sadece okur — bu dosyayı asla import
// etmez.
//
// ÖNEMLİ — bu sistemde artık "kilit" (manualOverride) ya da "hayalet kayıt
// temizliği" (lastSeenAt) YOK. Admin'in "Taramayı Başlat" butonu her seferinde
// TÜM piyasa değeri verisini siler ve sıfırdan tarar (bkz.
// lib/market-value-cron-run.ts -> wipeAllMarketValueData). Admin onayı bir
// sonraki taramaya taşınmaz; her taramadan sonra review kuyruğu yeniden
// gözden geçirilir.
// ---------------------------------------------------------------------------

/** Bir ligin, zincirleme (takım bazlı) işlenmeye hazır takım listesi. */
export interface TeamSyncTask {
  match: TeamMatchResult
  /** API-Football takımının ülkesi — hazırlık adımında bir kez çekilir, tekrar sorgulanmaz. */
  teamCountry: string | null
}

export interface LeagueTeamProgress {
  season: number
  tasks: TeamSyncTask[]
  nextTeamIndex: number
  teamsMatched: number
  teamsReview: number
  teamsUnmatched: number
  playersMatched: number
  playersReview: number
  playersUnmatched: number
}

export interface TeamSyncCounts {
  teamsMatched: number
  teamsReview: number
  teamsUnmatched: number
  playersMatched: number
  playersReview: number
  playersUnmatched: number
}

const EMPTY_TEAM_SYNC_COUNTS: TeamSyncCounts = {
  teamsMatched: 0,
  teamsReview: 0,
  teamsUnmatched: 0,
  playersMatched: 0,
  playersReview: 0,
  playersUnmatched: 0,
}

interface ReviewEntryInput {
  entityType: "league" | "team" | "player"
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
 * böylece her tarama aynı belirsiz eşleşme için kuyrukta sonsuz çoğalma
 * yapmaz — kayıt güncellenir (ve "resolvedAt" sıfırlanır, çünkü artık yeni
 * bir taramanın sonucu).
 */
async function upsertReviewQueueEntry(input: ReviewEntryInput): Promise<void> {
  const id = `${input.entityType}-${input.entityId}`
  const now = new Date()
  const candidateValueEur = input.candidateValueEur !== null ? String(input.candidateValueEur) : null

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
      candidateValueEur,
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
        candidateValueEur,
        confidence: input.confidence,
        status: "pending",
        resolvedAt: null,
      },
    })
}

async function upsertLeagueMarketValue(
  leagueId: number,
  leagueName: string,
  leagueCountry: string | null,
  match: LeagueMatchResult,
  transfermarktLeagueName: string | null,
  transfermarktLeagueCountry: string | null,
  totalValueEur: number | null,
): Promise<void> {
  const id = `league-${leagueId}`
  const now = new Date()
  const values = {
    id,
    leagueId,
    leagueName,
    leagueCountry,
    transfermarktLeagueName,
    transfermarktLeagueCountry,
    totalValueEur: totalValueEur !== null ? String(totalValueEur) : null,
    nameMatchPercent: match.nameMatchPercent,
    countryMatchPercent: match.countryMatchPercent,
    matchPercent: match.matchPercent,
    matchStatus: match.matchStatus,
    lastScrapedAt: now,
    updatedAt: now,
  }

  await db.insert(leagueMarketValue).values(values).onConflictDoUpdate({ target: leagueMarketValue.leagueId, set: values })
}

async function upsertTeamMarketValue(leagueId: number, tm: TeamMatchResult, teamCountry: string | null): Promise<void> {
  const id = `team-${tm.apiFootballTeamId}`
  const now = new Date()
  const values = {
    id,
    teamId: tm.apiFootballTeamId,
    leagueId,
    teamName: tm.apiFootballTeamName,
    teamCountry,
    transfermarktTeamId: tm.transfermarktTeamId,
    transfermarktTeamSlug: null,
    transfermarktTeamName: tm.transfermarktTeamName,
    transfermarktTeamCountry: tm.transfermarktTeamCountry,
    totalValueEur: tm.totalValueEur !== null ? String(tm.totalValueEur) : null,
    nameMatchPercent: tm.nameMatchPercent,
    countryMatchPercent: tm.countryMatchPercent,
    matchConfidence: tm.confidence,
    matchStatus: tm.status,
    lastScrapedAt: now,
    updatedAt: now,
  }

  await db.insert(teamMarketValue).values(values).onConflictDoUpdate({ target: teamMarketValue.teamId, set: values })
}

async function upsertPlayerMarketValue(teamId: number, pm: PlayerMatchResult): Promise<void> {
  const id = `player-${pm.apiFootballPlayerId}`
  const now = new Date()
  const values = {
    id,
    playerId: pm.apiFootballPlayerId,
    teamId,
    playerName: pm.apiFootballPlayerName,
    // pm.transfermarktPlayerName, Transfermarkt kadro sayfasından gelen TAM
    // ad (örn. "Ousmane Dembélé") — playerName ise API-Football'ın kısa
    // formatı ("O. Dembélé"). Arama ekranı ikisini de kontrol eder.
    fullName: pm.transfermarktPlayerName,
    playerCountry: pm.apiFootballPlayerCountry,
    transfermarktPlayerId: pm.transfermarktPlayerId,
    transfermarktPlayerSlug: null,
    transfermarktPlayerCountry: pm.transfermarktPlayerCountry,
    valueEur: pm.valueEur !== null ? String(pm.valueEur) : null,
    nameMatchPercent: pm.nameMatchPercent,
    countryMatchPercent: pm.countryMatchPercent,
    matchConfidence: pm.confidence,
    matchStatus: pm.status,
    lastScrapedAt: now,
    updatedAt: now,
  }

  await db.insert(playerMarketValue).values(values).onConflictDoUpdate({ target: playerMarketValue.playerId, set: values })
}

/**
 * Bir takımın kadrosunu Transfermarkt'tan çekip oyuncuları eşleştirir ve
 * yazar.
 *
 * Export edilmiştir: cron'un normal akışının dışında, bir admin bir takımı
 * review kuyruğundan ONAYLADIĞI anda da çağrılabilir (bkz.
 * app/actions/market-value-review.ts -> approveReviewEntry).
 */
export async function syncTeamPlayers(
  apiFootballTeamId: number,
  transfermarktTeamId: string,
  season: number,
): Promise<TeamSyncCounts["playersMatched"] extends never ? never : { matched: number; review: number; unmatched: number }> {
  const counts = { matched: 0, review: 0, unmatched: 0 }

  await sleep(TM_REQUEST_DELAY_MS)
  const scrapedPlayers = await scrapeTeamSquad(transfermarktTeamId)
  if (scrapedPlayers.length === 0) return counts

  const playerMatches = await matchPlayersForTeam(apiFootballTeamId, scrapedPlayers, season)

  for (const pm of playerMatches) {
    await upsertPlayerMarketValue(apiFootballTeamId, pm)

    if (pm.status === "unmatched") {
      counts.unmatched++
      continue
    }
    if (pm.status === "review") {
      counts.review++
      await upsertReviewQueueEntry({
        entityType: "player",
        entityId: pm.apiFootballPlayerId,
        entityName: pm.apiFootballPlayerName,
        entityCountry: pm.apiFootballPlayerCountry,
        candidateName: pm.transfermarktPlayerName,
        candidateTransfermarktId: pm.transfermarktPlayerId,
        candidateCountry: pm.transfermarktPlayerCountry,
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
 * Bir ligin takım listesini çekip eşleştirir, `leagueMarketValue` satırını
 * yazar ve zincirleme işlenmeye hazır `tasks` listesini döndürür. Asıl ağır
 * iş (her takımın kadrosunu çekmek) burada YAPILMAZ; dönen `tasks` tek tek
 * `syncSingleTeam` ile işlenir (bkz. lib/market-value-cron-run.ts).
 *
 * Takım+ülke eşleştirmesinin doğru sonuç vermesi için her API-Football
 * takımının ülkesi (`getTeamCountry`) ve her Transfermarkt takımının ülkesi
 * (`scrapeTeamCountry`) burada, eşleştirmeden ÖNCE toplanır — bu adım artık
 * öncekinden daha ağır (takım sayısı kadar ekstra istek) ama tek bir HTTP
 * çağrısı (route.ts -> processCronRunStep) içinde, maxDuration'ın altında
 * kalacak şekilde sırayla işlenir.
 */
export async function prepareLeagueTeamSync(leagueId: number): Promise<LeagueTeamProgress> {
  const season = currentSeason()

  // Bir önceki ligin son isteğinden sonra Transfermarkt'a hemen yeni bir lig
  // sayfası isteği atmamak için bekleme.
  await sleep(TM_REQUEST_DELAY_MS)

  const [apiFootballTeams, scraped, leagueBasic] = await Promise.all([
    getLeagueTeamsForMatching(leagueId, season),
    scrapeLeagueTeams(leagueId),
    getLeagueBasicInfo(leagueId),
  ])

  // API-Football takım ülkeleri — kendi istemcisi (api-football-client) zaten
  // 429/5xx için üstel geri çekilmeyle yeniden deniyor, bu yüzden burada ek
  // bir gecikme gerekmez, paralel çekilebilir.
  const afCountryEntries = await Promise.all(
    apiFootballTeams.map(async (af) => [af.id, await getTeamCountry(af.id)] as const),
  )
  const teamCountryMap = new Map<number, string | null>(afCountryEntries)

  // Transfermarkt takım ülkeleri — TEK istemci, art arda hızlı istek atmamak
  // için her istekten önce sabit gecikme.
  const transfermarktCountryMap = new Map<string, string | null>()
  for (const st of scraped.teams) {
    await sleep(TM_REQUEST_DELAY_MS)
    transfermarktCountryMap.set(st.transfermarktId, await scrapeTeamCountry(st.transfermarktId))
  }

  const teamMatches = matchTeams(apiFootballTeams, scraped.teams, teamCountryMap, transfermarktCountryMap)

  const leagueName = leagueBasic?.league.name ?? String(leagueId)
  const leagueCountry = leagueBasic?.league.country ?? null
  const leagueMatch = matchLeague(leagueName, leagueCountry, scraped.leagueName, scraped.leagueCountry)
  const leagueTotalValueEur = scraped.teams.reduce<number | null>((sum, t) => {
    if (t.totalValueEur === null) return sum
    return (sum ?? 0) + t.totalValueEur
  }, null)

  await upsertLeagueMarketValue(
    leagueId,
    leagueName,
    leagueCountry,
    leagueMatch,
    scraped.leagueName,
    scraped.leagueCountry,
    leagueTotalValueEur,
  )

  if (leagueMatch.matchStatus === "review") {
    await upsertReviewQueueEntry({
      entityType: "league",
      entityId: leagueId,
      entityName: leagueName,
      entityCountry: leagueCountry,
      candidateName: scraped.leagueName,
      candidateTransfermarktId: null,
      candidateCountry: scraped.leagueCountry,
      candidateValueEur: leagueTotalValueEur,
      confidence: leagueMatch.matchPercent,
    })
  }

  const tasks: TeamSyncTask[] = teamMatches.map((match) => ({
    match,
    teamCountry: teamCountryMap.get(match.apiFootballTeamId) ?? null,
  }))

  return {
    season,
    tasks,
    nextTeamIndex: 0,
    teamsMatched: 0,
    teamsReview: 0,
    teamsUnmatched: 0,
    playersMatched: 0,
    playersReview: 0,
    playersUnmatched: 0,
  }
}

/**
 * Zincirin en küçük birimi: SADECE bir takımı (varsa kadrosuyla) işler.
 * `prepareLeagueTeamSync`'in ürettiği tek bir `TeamSyncTask`'ı alır.
 */
export async function syncSingleTeam(leagueId: number, task: TeamSyncTask, season: number): Promise<TeamSyncCounts> {
  const tm = task.match

  await upsertTeamMarketValue(leagueId, tm, task.teamCountry)

  if (tm.status === "unmatched") {
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsUnmatched: 1 }
  }

  if (tm.status === "review") {
    await upsertReviewQueueEntry({
      entityType: "team",
      entityId: tm.apiFootballTeamId,
      entityName: tm.apiFootballTeamName,
      entityCountry: task.teamCountry,
      candidateName: tm.transfermarktTeamName,
      candidateTransfermarktId: tm.transfermarktTeamId,
      candidateCountry: tm.transfermarktTeamCountry,
      candidateValueEur: tm.totalValueEur,
      confidence: tm.confidence,
    })
    // Belirsiz takım eşleşmesinde oyuncu aramasına girmiyoruz — yanlış
    // takımın kadrosuyla eşleştirme yapıp hatalı veri üretmemek için.
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsReview: 1 }
  }

  // Takım eşleşti (status === "matched") — kadroyu çek ve oyuncuları eşleştir.
  if (!tm.transfermarktTeamId) {
    return { ...EMPTY_TEAM_SYNC_COUNTS, teamsMatched: 1 }
  }
  const counts = await syncTeamPlayers(tm.apiFootballTeamId, tm.transfermarktTeamId, season)
  return {
    ...EMPTY_TEAM_SYNC_COUNTS,
    teamsMatched: 1,
    playersMatched: counts.matched,
    playersReview: counts.review,
    playersUnmatched: counts.unmatched,
  }
}
