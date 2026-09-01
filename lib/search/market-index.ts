import { pool } from "@/lib/db"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"

const LATEST_COMPLETED_MATCH_RUN = `
  SELECT id, "transfermarktRunId", "apiFootballRunId"
  FROM player_match_run
  WHERE status = 'completed'
  ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
  LIMIT 1
`

function uniqueIds(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}

function positiveNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function withFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query()
  } catch {
    return fallback
  }
}

const MATCHED_PLAYERS_FROM = `
  FROM latest l
  JOIN player_match_result r
    ON r."matchRunId" = l.id
   AND r."matchedLevel" IN ('exact_biographic', 'fuzzy_name_birthdate')
   AND r."apiFootballPlayerId" IS NOT NULL
   AND r."apiFootballPlayerId" > 0
  JOIN api_football_player_snapshot ap
    ON ap."sourceId" = r."apiFootballPlayerId"
   AND ap."runId" = l."apiFootballRunId"
  JOIN api_football_team_snapshot at
    ON at."sourceId" = ap."teamSourceId"
   AND at."runId" = l."apiFootballRunId"
  JOIN transfermarkt_player_snapshot tp
    ON tp."sourceId" = r."transfermarktPlayerId"
   AND tp."runId" = l."transfermarktRunId"
`

interface PlayerRow {
  playerId: number
  playerName: string
  fullName: string | null
  teamId: number
  teamName: string | null
  leagueId: number
  valueEur: string | number | null
  detailedPosition: string | null
}

export interface MatchedPlayerSnapshotEntry {
  playerId: number
  playerName: string
  fullName: string | null
  teamId: number
  teamName: string | null
  leagueId: number
  valueEur: number
  detailedPosition: string | null
}

export type FeaturedPlayerMarketValueEntry = MatchedPlayerSnapshotEntry

function toEntries(rows: PlayerRow[]): MatchedPlayerSnapshotEntry[] {
  return rows.flatMap((row) => {
    const valueEur = positiveNumber(row.valueEur)
    if (valueEur == null || !Number.isInteger(row.playerId) || row.playerId <= 0) return []
    return [{
      playerId: row.playerId,
      playerName: row.playerName,
      fullName: row.fullName,
      teamId: row.teamId,
      teamName: row.teamName,
      leagueId: row.leagueId,
      valueEur,
      detailedPosition: row.detailedPosition,
    }]
  })
}

const PLAYER_SELECT = `
  SELECT ap."sourceId" AS "playerId", ap.name AS "playerName", tp.name AS "fullName",
         ap."teamSourceId" AS "teamId", at.name AS "teamName",
         at."leagueSourceId" AS "leagueId", tp."marketValueEur" AS "valueEur",
         tp."detailedPosition" AS "detailedPosition"
`

export async function getMatchedPlayerCandidates(): Promise<MatchedPlayerSnapshotEntry[]> {
  return withFallback(async () => {
    const result = await pool.query<PlayerRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      ${PLAYER_SELECT}
      ${MATCHED_PLAYERS_FROM}
      WHERE tp."marketValueEur" > 0
    `)
    return toEntries(result.rows)
  }, [])
}

export async function getFeaturedPlayerMarketValues(): Promise<FeaturedPlayerMarketValueEntry[]> {
  return withFallback(async () => {
    const result = await pool.query<PlayerRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      ${PLAYER_SELECT}
      ${MATCHED_PLAYERS_FROM}
      WHERE at."leagueSourceId" = ANY($1::int[]) AND tp."marketValueEur" > 0
    `, [FEATURED_LEAGUE_IDS])
    return toEntries(result.rows)
  }, [])
}

export async function getPlayerMarketValuesByTeamIds(teamIds: number[]): Promise<MatchedPlayerSnapshotEntry[]> {
  const ids = uniqueIds(teamIds)
  if (!ids.length) return []
  return withFallback(async () => {
    const result = await pool.query<PlayerRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      ${PLAYER_SELECT}
      ${MATCHED_PLAYERS_FROM}
      WHERE ap."teamSourceId" = ANY($1::int[]) AND tp."marketValueEur" > 0
    `, [ids])
    return toEntries(result.rows)
  }, [])
}

export async function getMatchedPlayerSnapshotsByIds(playerIds: number[]): Promise<MatchedPlayerSnapshotEntry[]> {
  const ids = uniqueIds(playerIds)
  if (!ids.length) return []
  return withFallback(async () => {
    const result = await pool.query<PlayerRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      ${PLAYER_SELECT}
      ${MATCHED_PLAYERS_FROM}
      WHERE ap."sourceId" = ANY($1::int[]) AND tp."marketValueEur" > 0
    `, [ids])
    return toEntries(result.rows)
  }, [])
}

export async function getPlayerMarketValueMapByIds(playerIds: number[]): Promise<Map<number, number>> {
  const rows = await getMatchedPlayerSnapshotsByIds(playerIds)
  return new Map(rows.map((row) => [row.playerId, row.valueEur]))
}

export const getPlayerMarketValues = getPlayerMarketValueMapByIds

export async function getPlayerMarketValue(playerId: number): Promise<number | null> {
  return (await getPlayerMarketValueMapByIds([playerId])).get(playerId) ?? null
}

async function getGroupedValues(column: "team" | "league", ids: number[]): Promise<Map<number, number>> {
  const validIds = uniqueIds(ids)
  if (!validIds.length) return new Map()
  const source = column === "team" ? 'ap."teamSourceId"' : 'at."leagueSourceId"'
  return withFallback(async () => {
    const result = await pool.query<{ id: number; total: string | number }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ${source} AS id, SUM(tp."marketValueEur") AS total
      ${MATCHED_PLAYERS_FROM}
      WHERE ${source} = ANY($1::int[]) AND tp."marketValueEur" > 0
      GROUP BY ${source}
    `, [validIds])
    return new Map(result.rows.flatMap((row) => {
      const total = positiveNumber(row.total)
      return total == null ? [] : [[Number(row.id), total] as const]
    }))
  }, new Map<number, number>())
}

export function getTeamMarketValueMapByTeamIds(teamIds: number[]): Promise<Map<number, number>> {
  return getGroupedValues("team", teamIds)
}

export const getTeamMarketValues = getTeamMarketValueMapByTeamIds

export async function getTeamMarketValue(teamId: number): Promise<number | null> {
  return (await getTeamMarketValueMapByTeamIds([teamId])).get(teamId) ?? null
}

export function getLeagueMarketValueMapByLeagueIds(leagueIds: number[]): Promise<Map<number, number>> {
  return getGroupedValues("league", leagueIds)
}

export async function getLeagueMarketValue(leagueId: number): Promise<number | null> {
  return (await getLeagueMarketValueMapByLeagueIds([leagueId])).get(leagueId) ?? null
}

export async function getFeaturedTeamMarketValueMap(): Promise<Map<number, number>> {
  const players = await getFeaturedPlayerMarketValues()
  const teamIds = [...new Set(players.map((player) => player.teamId))]
  return getTeamMarketValueMapByTeamIds(teamIds)
}

export function getFeaturedLeagueMarketValueMap(): Promise<Map<number, number>> {
  return getLeagueMarketValueMapByLeagueIds(FEATURED_LEAGUE_IDS)
}
