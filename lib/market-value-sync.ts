import { db } from "./db"
import { teamMarketValue, playerMarketValue, marketValueReviewQueue } from "./db/schema"
import { eq } from "drizzle-orm"
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

/** Bir ligin takım + oyuncu piyasa değerlerini scrape edip DB'ye yazar. */
export async function syncLeagueMarketValues(leagueId: number): Promise<{
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

  let teamsMatched = 0
  let teamsReview = 0
  let teamsUnmatched = 0
  let playersMatched = 0
  let playersReview = 0
  let playersUnmatched = 0

  for (const tm of teamMatches) {
    await upsertTeamMarketValue(leagueId, tm)

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
    // Transfermarkt'a art arda çok hızlı istek atmamak için takımlar arası
    // küçük bir bekleme (rate-limit / 503 riskini azaltır).
    await sleep(700)
    let scrapedPlayers = await scrapeTeamSquad(tm.transfermarktTeamId)
    if (scrapedPlayers.length === 0) {
      // Geçici bir rate-limit (503) olabilir — biraz daha bekleyip bir kez tekrar dene.
      await sleep(2000)
      scrapedPlayers = await scrapeTeamSquad(tm.transfermarktTeamId)
    }
    if (scrapedPlayers.length === 0) continue

    const playerMatches = await matchPlayersForTeam(tm.apiFootballTeamId, scrapedPlayers)

    for (const pm of playerMatches) {
      await upsertPlayerMarketValue(tm.apiFootballTeamId, pm)

      if (pm.status === "unmatched") {
        playersUnmatched++
        continue
      }
      if (pm.status === "review") {
        playersReview++
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
      playersMatched++
    }
  }

  return { leagueId, teamsMatched, teamsReview, teamsUnmatched, playersMatched, playersReview, playersUnmatched }
}

async function upsertTeamMarketValue(
  leagueId: number,
  tm: Awaited<ReturnType<typeof matchTeams>>[number],
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
        updatedAt: now,
      },
    })
}

async function upsertPlayerMarketValue(
  teamId: number,
  pm: Awaited<ReturnType<typeof matchPlayersForTeam>>[number],
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

export { SCRAPABLE_LEAGUE_IDS }
