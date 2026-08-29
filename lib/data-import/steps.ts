import { db } from '@/lib/db'
import { apiFootballFetch } from '@/lib/api-football-client'
import {
  apiFootballLeagueSnapshot, apiFootballPlayerSnapshot, apiFootballTeamSnapshot,
  transfermarktLeague, transfermarktPlayer, transfermarktTeam,
} from '@/lib/db/schema'
import { TRANSFERMARKT_SEASON, type ImportLeague, type ImportSource } from './scope'
import { completeCheckpoint, failRun, finishRun, heartbeat, incrementProgress, isCheckpointComplete, recordImportError } from './repository'
import { fetchTransfermarktHtml } from './transfermarkt-http'
import { buildTeamSquadUrl, parseLeagueTeams, parsePlayerDetail, parseTeamSquad } from './transfermarkt-parser'

export async function prepareImportStep(runId: string, source: ImportSource) {
  'use step'
  await heartbeat(runId, { status: 'running', stage: 'leagues', processedLeagues: 0, successfulLeagues: 0, failedLeagues: 0 })
  return source
}

export async function importTransfermarktLeagueStep(runId: string, league: ImportLeague) {
  'use step'
  if (await isCheckpointComplete(runId, 'league', league.transfermarktId)) return true
  await heartbeat(runId, { stage: 'league-teams', activeLeague: league.name, activeUrl: league.transfermarktUrl })
  try {
    const teams = parseLeagueTeams(await fetchTransfermarktHtml(league.transfermarktUrl))
    await db.insert(transfermarktLeague).values({ sourceId: league.transfermarktId, runId, name: league.name, country: league.country, sourceUrl: league.transfermarktUrl, seenAt: new Date() }).onConflictDoUpdate({ target: transfermarktLeague.sourceId, set: { runId, name: league.name, country: league.country, sourceUrl: league.transfermarktUrl, seenAt: new Date() } })
    let discoveredTeams = 0
    for (const team of teams) {
      if (await isCheckpointComplete(runId, 'team_discovered', team.sourceId)) continue
      await completeCheckpoint({ runId, source: 'transfermarkt', kind: 'team_discovered', itemKey: team.sourceId, parentKey: league.transfermarktId, url: team.url })
      discoveredTeams++
    }
    if (discoveredTeams) await incrementProgress(runId, 'totalTeams', discoveredTeams)
    let leagueComplete = true
    for (const team of teams) {
      if (await isCheckpointComplete(runId, 'team', team.sourceId)) continue
      const squadUrl = buildTeamSquadUrl(team.url, TRANSFERMARKT_SEASON)
      await heartbeat(runId, { stage: 'team-squad', activeTeam: team.name, activeUrl: squadUrl })
      try {
        const squad = parseTeamSquad(await fetchTransfermarktHtml(squadUrl))
        await db.insert(transfermarktTeam).values({ sourceId: team.sourceId, runId, leagueSourceId: league.transfermarktId, name: team.name, sourceUrl: team.url, seenAt: new Date() }).onConflictDoUpdate({ target: transfermarktTeam.sourceId, set: { runId, leagueSourceId: league.transfermarktId, name: team.name, sourceUrl: team.url, seenAt: new Date() } })
        let discoveredPlayers = 0
        for (const player of squad) {
          if (await isCheckpointComplete(runId, 'player_discovered', player.sourceId)) continue
          await completeCheckpoint({ runId, source: 'transfermarkt', kind: 'player_discovered', itemKey: player.sourceId, parentKey: team.sourceId, url: player.url })
          discoveredPlayers++
        }
        if (discoveredPlayers) await incrementProgress(runId, 'totalPlayers', discoveredPlayers)
        let teamComplete = true
        for (const player of squad) {
          if (await isCheckpointComplete(runId, 'player', player.sourceId)) continue
          await heartbeat(runId, { stage: 'player-detail', activeUrl: player.url })
          try {
            const detail = parsePlayerDetail(await fetchTransfermarktHtml(player.url))
            await db.insert(transfermarktPlayer).values({ sourceId: player.sourceId, runId, teamSourceId: team.sourceId, name: detail.name, birthDate: detail.birthDate ? new Date(`${detail.birthDate}T00:00:00.000Z`) : null, detailedPosition: detail.detailedPosition, marketValueRaw: detail.marketValueRaw, marketValueEur: detail.marketValueEur == null ? null : String(detail.marketValueEur), currentTeamName: detail.currentTeamName, sourceUrl: player.url, seenAt: new Date() }).onConflictDoUpdate({ target: transfermarktPlayer.sourceId, set: { runId, teamSourceId: team.sourceId, name: detail.name, birthDate: detail.birthDate ? new Date(`${detail.birthDate}T00:00:00.000Z`) : null, detailedPosition: detail.detailedPosition, marketValueRaw: detail.marketValueRaw, marketValueEur: detail.marketValueEur == null ? null : String(detail.marketValueEur), currentTeamName: detail.currentTeamName, sourceUrl: player.url, seenAt: new Date() } })
            await completeCheckpoint({ runId, source: 'transfermarkt', kind: 'player', itemKey: player.sourceId, parentKey: team.sourceId, url: player.url })
            await incrementProgress(runId, 'processedPlayers')
            await incrementProgress(runId, 'successfulPlayers')
          } catch (error) {
            teamComplete = false
            await recordImportError({ runId, source: 'transfermarkt', kind: 'player', itemKey: player.sourceId, errorType: error instanceof Error && 'kind' in error ? String(error.kind) : 'player_parse', message: error instanceof Error ? error.message : 'Oyuncu hatası', url: player.url, retryable: true })
            await incrementProgress(runId, 'processedPlayers')
            await incrementProgress(runId, 'failedPlayers')
          }
        }
        await incrementProgress(runId, 'processedTeams')
        if (teamComplete) {
          await completeCheckpoint({ runId, source: 'transfermarkt', kind: 'team', itemKey: team.sourceId, parentKey: league.transfermarktId, url: squadUrl, metadata: { players: squad.length, detailedPlayers: squad.length } })
          await incrementProgress(runId, 'successfulTeams')
        } else {
          leagueComplete = false
          await incrementProgress(runId, 'failedTeams')
        }
      } catch (error) {
        leagueComplete = false
        await recordImportError({ runId, source: 'transfermarkt', kind: 'team', itemKey: team.sourceId, errorType: 'team_import', message: error instanceof Error ? error.message : 'Takım hatası', url: squadUrl, retryable: true })
        await incrementProgress(runId, 'processedTeams')
        await incrementProgress(runId, 'failedTeams')
      }
    }
    await incrementProgress(runId, 'processedLeagues')
    if (leagueComplete) {
      await completeCheckpoint({ runId, source: 'transfermarkt', kind: 'league', itemKey: league.transfermarktId, url: league.transfermarktUrl, metadata: { teams: teams.length } })
      await incrementProgress(runId, 'successfulLeagues')
    } else {
      await incrementProgress(runId, 'failedLeagues')
    }
    return leagueComplete
  } catch (error) {
    await recordImportError({ runId, source: 'transfermarkt', kind: 'league', itemKey: league.transfermarktId, errorType: 'league_import', message: error instanceof Error ? error.message : 'Lig hatası', url: league.transfermarktUrl, retryable: true })
    await incrementProgress(runId, 'processedLeagues')
    await incrementProgress(runId, 'failedLeagues')
    return false
  }
}

type ApiTeam = { team: { id: number; name: string } }
type ApiSquad = { team: { id: number; name: string }; players: Array<{ id: number; name: string; age?: number; number?: number; position?: string; photo?: string }> }
type ApiPlayer = { player: { id: number; name: string; birth?: { date?: string } }; statistics?: Array<{ team?: { id: number; name: string } }> }

export async function importApiFootballLeagueStep(runId: string, league: ImportLeague, season: number) {
  'use step'
  const key = String(league.apiFootballId)
  if (await isCheckpointComplete(runId, 'league', key)) return
  await heartbeat(runId, { stage: 'league-teams', activeLeague: league.name, activeUrl: `/teams?league=${key}&season=${season}` })
  try {
    const teams = await apiFootballFetch<ApiTeam>('/teams', { league: league.apiFootballId, season }, { cache: 'no-store' })
    await db.insert(apiFootballLeagueSnapshot).values({ sourceId: league.apiFootballId, runId, name: league.name, country: league.country, season, seenAt: new Date() }).onConflictDoUpdate({ target: apiFootballLeagueSnapshot.sourceId, set: { runId, name: league.name, country: league.country, season, seenAt: new Date() } })
    await incrementProgress(runId, 'totalTeams', teams.length)
    for (const item of teams) {
      const team = item.team; const teamKey = String(team.id)
      if (await isCheckpointComplete(runId, 'team', teamKey)) continue
      await heartbeat(runId, { stage: 'team-squad', activeTeam: team.name, activeUrl: `/players/squads?team=${team.id}` })
      try {
        const squads = await apiFootballFetch<ApiSquad>('/players/squads', { team: team.id }, { cache: 'no-store' })
        await db.insert(apiFootballTeamSnapshot).values({ sourceId: team.id, runId, leagueSourceId: league.apiFootballId, name: team.name, seenAt: new Date() }).onConflictDoUpdate({ target: apiFootballTeamSnapshot.sourceId, set: { runId, leagueSourceId: league.apiFootballId, name: team.name, seenAt: new Date() } })
        const squadPlayers = squads.flatMap((squad) => squad.players)
        await incrementProgress(runId, 'totalPlayers', squadPlayers.length)
        for (const squadPlayer of squadPlayers) {
          if (await isCheckpointComplete(runId, 'player', String(squadPlayer.id))) continue
          const details = await apiFootballFetch<ApiPlayer>('/players', { id: squadPlayer.id, season }, { cache: 'no-store' })
          const detail = details[0]
          const currentTeamName = detail?.statistics?.find((stat) => stat.team?.id === team.id)?.team?.name ?? team.name
          await db.insert(apiFootballPlayerSnapshot).values({ sourceId: squadPlayer.id, runId, teamSourceId: team.id, name: detail?.player.name ?? squadPlayer.name, birthDate: detail?.player.birth?.date ? new Date(`${detail.player.birth.date}T00:00:00.000Z`) : null, currentTeamName, seenAt: new Date() }).onConflictDoUpdate({ target: apiFootballPlayerSnapshot.sourceId, set: { runId, teamSourceId: team.id, name: detail?.player.name ?? squadPlayer.name, birthDate: detail?.player.birth?.date ? new Date(`${detail.player.birth.date}T00:00:00.000Z`) : null, currentTeamName, seenAt: new Date() } })
          await completeCheckpoint({ runId, source: 'api_football', kind: 'player', itemKey: String(squadPlayer.id), parentKey: teamKey })
          await incrementProgress(runId, 'processedPlayers')
          await incrementProgress(runId, 'successfulPlayers')
        }
        await completeCheckpoint({ runId, source: 'api_football', kind: 'team', itemKey: teamKey, parentKey: key, metadata: { players: squadPlayers.length } })
        await incrementProgress(runId, 'processedTeams')
        await incrementProgress(runId, 'successfulTeams')
      } catch (error) {
        await recordImportError({ runId, source: 'api_football', kind: 'team', itemKey: teamKey, errorType: 'api_football', message: error instanceof Error ? error.message : 'Takım hatası', url: `/players/squads?team=${team.id}`, retryable: true })
        await incrementProgress(runId, 'processedTeams')
        await incrementProgress(runId, 'failedTeams')
      }
    }
    await completeCheckpoint({ runId, source: 'api_football', kind: 'league', itemKey: key, metadata: { teams: teams.length } })
    await incrementProgress(runId, 'processedLeagues')
    await incrementProgress(runId, 'successfulLeagues')
  } catch (error) {
    await recordImportError({ runId, source: 'api_football', kind: 'league', itemKey: key, errorType: 'api_football', message: error instanceof Error ? error.message : 'Lig hatası', retryable: true })
    await incrementProgress(runId, 'processedLeagues')
    await incrementProgress(runId, 'failedLeagues')
    throw error
  }
}

export async function finishImportStep(runId: string, source: ImportSource) { 'use step'; await finishRun(runId, source) }
export async function failImportStep(runId: string, error: unknown) { 'use step'; await failRun(runId, error) }
