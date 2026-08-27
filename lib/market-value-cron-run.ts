import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  leagueMarketValue,
  marketValueCronRun,
  marketValueLeagueStaging,
  marketValuePlayerStaging,
  marketValueReviewQueue,
  marketValueTeamStaging,
  playerMarketValue,
  teamMarketValue,
} from "@/lib/db/schema"
import { apiFootballFetch } from "@/lib/api-football-client"
import { currentSeason, getLeagueBasicInfo, getSquad, getTeamCountry } from "@/lib/api-football"
import { matchLeague, matchPlayers, matchStagedEntities, type StagedEntity } from "@/lib/market-value-matcher"
import { SCRAPABLE_LEAGUE_IDS, scrapeLeagueTeams, scrapeTeamSquad, sleep, TM_REQUEST_DELAY_MS } from "@/lib/transfermarkt-scraper"

export type MarketValuePhase = "tm_leagues" | "tm_players" | "af_leagues" | "af_teams" | "af_players" | "matching" | "done"
export type CronRunRow = typeof marketValueCronRun.$inferSelect

type ApiTeamResponse = { team?: { id?: number; name?: string; country?: string | null } }

function stagingId(runId: string, side: "tm" | "af", type: "league" | "team" | "player", externalId: string) {
  return `${runId}:${side}:${type}:${externalId}`
}

function value(value: string | null): number | null {
  return value === null ? null : Number(value)
}

async function updateRun(runId: string, values: Partial<typeof marketValueCronRun.$inferInsert>) {
  const [updated] = await db.update(marketValueCronRun).set({ ...values, heartbeatAt: new Date(), updatedAt: new Date(), lastError: null, lastErrorAt: null }).where(eq(marketValueCronRun.id, runId)).returning()
  return updated
}

export async function getActiveCronRun() {
  const [run] = await db.select().from(marketValueCronRun).where(eq(marketValueCronRun.status, "running")).orderBy(asc(marketValueCronRun.createdAt)).limit(1)
  return run ?? null
}

export async function createCronRun() {
  const id = crypto.randomUUID()
  const [run] = await db.insert(marketValueCronRun).values({ id, runStartedAt: new Date(), status: "running", phase: "tm_leagues" }).returning()
  return run
}

async function failStep(run: CronRunRow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const [updated] = await db.update(marketValueCronRun).set({ lastError: message, lastErrorAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(marketValueCronRun.id, run.id)).returning()
  return updated
}

async function stageTmLeague(run: CronRunRow) {
  const leagueId = SCRAPABLE_LEAGUE_IDS[run.currentLeagueIndex]
  const scraped = await scrapeLeagueTeams(leagueId)
  const total = scraped.teams.reduce((sum, team) => sum + (team.totalValueEur ?? 0), 0)
  await db.insert(marketValueLeagueStaging).values({ id: stagingId(run.id, "tm", "league", String(leagueId)), runId: run.id, leagueId, tmName: scraped.leagueName, tmCountry: scraped.leagueCountry, tmValueEur: String(total) }).onConflictDoUpdate({ target: marketValueLeagueStaging.leagueId, set: { runId: run.id, tmName: scraped.leagueName, tmCountry: scraped.leagueCountry, tmValueEur: String(total), updatedAt: new Date() } })
  if (scraped.teams.length) await db.insert(marketValueTeamStaging).values(scraped.teams.map((team) => ({ id: stagingId(run.id, "tm", "team", team.transfermarktId), runId: run.id, leagueId, side: "tm", externalId: team.transfermarktId, name: team.name, valueEur: team.totalValueEur === null ? null : String(team.totalValueEur) }))).onConflictDoNothing()
  const next = run.currentLeagueIndex + 1
  return updateRun(run.id, next >= SCRAPABLE_LEAGUE_IDS.length ? { phase: "tm_players", currentLeagueIndex: 0, currentTeamIndex: 0 } : { currentLeagueIndex: next })
}

async function stageTmPlayers(run: CronRunRow) {
  const teams = await db.select().from(marketValueTeamStaging).where(and(eq(marketValueTeamStaging.runId, run.id), eq(marketValueTeamStaging.side, "tm"))).orderBy(asc(marketValueTeamStaging.createdAt))
  const team = teams[run.currentTeamIndex]
  if (!team) return updateRun(run.id, { phase: "af_leagues", currentTeamIndex: 0, currentLeagueIndex: 0 })
  if (run.currentTeamIndex > 0) await sleep(TM_REQUEST_DELAY_MS)
  const players = await scrapeTeamSquad(team.externalId)
  if (players.length) await db.insert(marketValuePlayerStaging).values(players.map((player) => ({ id: stagingId(run.id, "tm", "player", `${team.externalId}:${player.transfermarktId}`), runId: run.id, teamStagingId: team.id, side: "tm", externalId: player.transfermarktId, name: player.name, country: player.nationality, valueEur: player.valueEur === null ? null : String(player.valueEur) }))).onConflictDoNothing()
  return updateRun(run.id, { currentTeamIndex: run.currentTeamIndex + 1 })
}

async function stageAfLeague(run: CronRunRow) {
  const leagueId = SCRAPABLE_LEAGUE_IDS[run.currentLeagueIndex]
  const info = await getLeagueBasicInfo(leagueId)
  await db.update(marketValueLeagueStaging).set({ afName: info?.league.name ?? String(leagueId), afCountry: info?.league.country ?? null, updatedAt: new Date() }).where(eq(marketValueLeagueStaging.leagueId, leagueId))
  const next = run.currentLeagueIndex + 1
  return updateRun(run.id, next >= SCRAPABLE_LEAGUE_IDS.length ? { phase: "af_teams", currentLeagueIndex: 0 } : { currentLeagueIndex: next })
}

async function stageAfTeams(run: CronRunRow) {
  const leagueId = SCRAPABLE_LEAGUE_IDS[run.currentLeagueIndex]
  const season = currentSeason()
  const response = await apiFootballFetch<ApiTeamResponse>("/teams", { league: leagueId, season }, { cache: "no-store" })
  const teams = await Promise.all(response.filter((row) => row.team?.id && row.team?.name).map(async (row) => ({ id: row.team!.id!, name: row.team!.name!, country: row.team!.country ?? await getTeamCountry(row.team!.id!) })))
  if (teams.length) await db.insert(marketValueTeamStaging).values(teams.map((team) => ({ id: stagingId(run.id, "af", "team", String(team.id)), runId: run.id, leagueId, side: "af", externalId: String(team.id), name: team.name, country: team.country }))).onConflictDoNothing()
  const next = run.currentLeagueIndex + 1
  return updateRun(run.id, next >= SCRAPABLE_LEAGUE_IDS.length ? { phase: "af_players", currentLeagueIndex: 0, currentTeamIndex: 0 } : { currentLeagueIndex: next })
}

async function stageAfPlayers(run: CronRunRow) {
  const teams = await db.select().from(marketValueTeamStaging).where(and(eq(marketValueTeamStaging.runId, run.id), eq(marketValueTeamStaging.side, "af"))).orderBy(asc(marketValueTeamStaging.createdAt))
  const team = teams[run.currentTeamIndex]
  if (!team) return updateRun(run.id, { phase: "matching", currentTeamIndex: 0, currentLeagueIndex: 0 })
  const players = await getSquad(Number(team.externalId))
  if (players.length) await db.insert(marketValuePlayerStaging).values(players.map((player) => ({ id: stagingId(run.id, "af", "player", `${team.externalId}:${player.id}`), runId: run.id, teamStagingId: team.id, side: "af", externalId: String(player.id), name: player.name, country: null }))).onConflictDoNothing()
  return updateRun(run.id, { currentTeamIndex: run.currentTeamIndex + 1 })
}

async function queueReview(run: CronRunRow, input: { entityType: "league" | "team" | "player"; leagueId: number; afName: string; afCountry: string | null; tmName: string | null; tmCountry: string | null; tmValueEur: number | null; confidence: number; afTeamStagingId?: string; tmTeamStagingId?: string; afPlayerStagingId?: string; tmPlayerStagingId?: string }) {
  await db.insert(marketValueReviewQueue).values({ id: crypto.randomUUID(), runId: run.id, ...input, tmValueEur: input.tmValueEur === null ? null : String(input.tmValueEur) })
}

function entity(row: typeof marketValueTeamStaging.$inferSelect | typeof marketValuePlayerStaging.$inferSelect): StagedEntity {
  return { externalId: row.externalId, name: row.name, country: row.country, valueEur: value(row.valueEur) }
}

async function matchOneLeague(run: CronRunRow) {
  const leagueId = SCRAPABLE_LEAGUE_IDS[run.currentLeagueIndex]
  const [league] = await db.select().from(marketValueLeagueStaging).where(and(eq(marketValueLeagueStaging.runId, run.id), eq(marketValueLeagueStaging.leagueId, leagueId))).limit(1)
  if (!league) throw new Error(`Lig staging kaydı bulunamadı: ${leagueId}`)
  const leagueMatch = matchLeague(league.afName ?? String(leagueId), league.afCountry, league.tmName, league.tmCountry)
  if (leagueMatch.matchStatus === "matched") await db.insert(leagueMarketValue).values({ id: crypto.randomUUID(), leagueId, leagueName: league.afName ?? String(leagueId), leagueCountry: league.afCountry, transfermarktLeagueName: league.tmName, transfermarktLeagueCountry: league.tmCountry, totalValueEur: league.tmValueEur, nameMatchPercent: leagueMatch.nameMatchPercent, countryMatchPercent: leagueMatch.countryMatchPercent, matchPercent: leagueMatch.matchPercent, lastScrapedAt: new Date() })
  else await queueReview(run, { entityType: "league", leagueId, afName: league.afName ?? String(leagueId), afCountry: league.afCountry, tmName: league.tmName, tmCountry: league.tmCountry, tmValueEur: value(league.tmValueEur), confidence: leagueMatch.matchPercent })

  const allTeams = await db.select().from(marketValueTeamStaging).where(and(eq(marketValueTeamStaging.runId, run.id), eq(marketValueTeamStaging.leagueId, leagueId)))
  const afTeams = allTeams.filter((row) => row.side === "af")
  const tmTeams = allTeams.filter((row) => row.side === "tm")
  const teamResults = matchStagedEntities(afTeams.map(entity), tmTeams.map(entity))
  for (const result of teamResults) {
    const af = afTeams.find((row) => row.externalId === result.af?.externalId)
    const tm = tmTeams.find((row) => row.externalId === result.tm?.externalId)
    if (!af) continue
    if (result.status === "matched" && tm) {
      await db.insert(teamMarketValue).values({ id: crypto.randomUUID(), teamId: Number(af.externalId), leagueId, teamName: af.name, teamCountry: af.country, transfermarktTeamId: tm.externalId, transfermarktTeamName: tm.name, transfermarktTeamCountry: tm.country, totalValueEur: tm.valueEur, nameMatchPercent: result.nameMatchPercent, countryMatchPercent: result.countryMatchPercent, matchConfidence: result.confidence, lastScrapedAt: new Date() })
      const players = await db.select().from(marketValuePlayerStaging).where(eq(marketValuePlayerStaging.runId, run.id))
      const afPlayers = players.filter((row) => row.teamStagingId === af.id && row.side === "af")
      const tmPlayers = players.filter((row) => row.teamStagingId === tm.id && row.side === "tm")
      for (const playerResult of matchPlayers(afPlayers.map(entity), tmPlayers.map(entity))) {
        const afPlayer = afPlayers.find((row) => row.externalId === playerResult.af?.externalId)
        const tmPlayer = tmPlayers.find((row) => row.externalId === playerResult.tm?.externalId)
        if (!afPlayer) continue
        if (playerResult.status === "matched" && tmPlayer) await db.insert(playerMarketValue).values({ id: crypto.randomUUID(), playerId: Number(afPlayer.externalId), teamId: Number(af.externalId), playerName: afPlayer.name, fullName: tmPlayer.name, playerCountry: afPlayer.country, transfermarktPlayerId: tmPlayer.externalId, transfermarktPlayerCountry: tmPlayer.country, valueEur: tmPlayer.valueEur, nameMatchPercent: playerResult.nameMatchPercent, countryMatchPercent: playerResult.countryMatchPercent, matchConfidence: playerResult.confidence, lastScrapedAt: new Date() })
        else await queueReview(run, { entityType: "player", leagueId, afName: afPlayer.name, afCountry: afPlayer.country, tmName: tmPlayer?.name ?? null, tmCountry: tmPlayer?.country ?? null, tmValueEur: value(tmPlayer?.valueEur ?? null), confidence: playerResult.confidence, afTeamStagingId: af.id, tmTeamStagingId: tm.id, afPlayerStagingId: afPlayer.id, tmPlayerStagingId: tmPlayer?.id })
      }
    } else await queueReview(run, { entityType: "team", leagueId, afName: af.name, afCountry: af.country, tmName: tm?.name ?? null, tmCountry: tm?.country ?? null, tmValueEur: value(tm?.valueEur ?? null), confidence: result.confidence, afTeamStagingId: af.id, tmTeamStagingId: tm?.id })
  }
  const next = run.currentLeagueIndex + 1
  return updateRun(run.id, next >= SCRAPABLE_LEAGUE_IDS.length ? { phase: "done", status: "done", currentLeagueIndex: SCRAPABLE_LEAGUE_IDS.length } : { currentLeagueIndex: next })
}

export async function processCronRunStep(run: CronRunRow): Promise<{ run: CronRunRow; done: boolean }> {
  try {
    let updated: CronRunRow
    switch (run.phase as MarketValuePhase) {
      case "tm_leagues": updated = await stageTmLeague(run); break
      case "tm_players": updated = await stageTmPlayers(run); break
      case "af_leagues": updated = await stageAfLeague(run); break
      case "af_teams": updated = await stageAfTeams(run); break
      case "af_players": updated = await stageAfPlayers(run); break
      case "matching": updated = await matchOneLeague(run); break
      default: return { run, done: true }
    }
    return { run: updated, done: updated.phase === "done" }
  } catch (error) {
    return { run: await failStep(run, error), done: false }
  }
}

export async function fireChainStepWithoutAwaitingResponse(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1500)
  try {
    await fetch(url, { method: "GET", headers, cache: "no-store", signal: controller.signal })
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function wipeAllMarketValueData() {
  await db.delete(playerMarketValue)
  await db.delete(teamMarketValue)
  await db.delete(leagueMarketValue)
  await db.delete(marketValueReviewQueue)
  await db.delete(marketValuePlayerStaging)
  await db.delete(marketValueTeamStaging)
  await db.delete(marketValueLeagueStaging)
  await db.delete(marketValueCronRun)
}
