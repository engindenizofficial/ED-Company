import { pool } from "@/lib/db"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"

const LATEST_COMPLETED_MATCH_RUN = `
  SELECT id, "transfermarktRunId", "apiFootballRunId"
  FROM player_match_run
  WHERE status = 'completed'
  ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
  LIMIT 1
`

function numberOrZero(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function uniqueIds(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}

async function withFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query()
  } catch {
    return fallback
  }
}

interface PlayerValueRow {
  playerId: number
  playerName: string
  fullName: string | null
  teamId: number
  teamName: string | null
  valueEur: string | null
}

export interface FeaturedPlayerMarketValueEntry {
  playerId: number
  playerName: string
  fullName: string | null
  teamId: number
  teamName: string | null
  valueEur: number
}

const MATCHED_PLAYERS_FROM = `
  FROM latest l
  JOIN player_match_result r
    ON r."matchRunId" = l.id
   AND r."matchedLevel" <> 'unmatched'
   AND r."apiFootballPlayerId" IS NOT NULL
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

function toPlayerEntries(rows: PlayerValueRow[]): FeaturedPlayerMarketValueEntry[] {
  return rows.map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    fullName: row.fullName,
    teamId: row.teamId,
    teamName: row.teamName,
    valueEur: numberOrZero(row.valueEur),
  }))
}

/** Son tamamlanmış eşleştirme koşusundaki öne çıkan lig oyuncuları. */
export async function getFeaturedPlayerMarketValues(): Promise<FeaturedPlayerMarketValueEntry[]> {
  return withFallback(async () => {
    const result = await pool.query<PlayerValueRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."sourceId" AS "playerId", ap.name AS "playerName",
             tp.name AS "fullName", ap."teamSourceId" AS "teamId",
             at.name AS "teamName", tp."marketValueEur" AS "valueEur"
      ${MATCHED_PLAYERS_FROM}
      WHERE at."leagueSourceId" = ANY($1::int[])
    `, [FEATURED_LEAGUE_IDS])
    return toPlayerEntries(result.rows)
  }, [])
}

/** teamId -> toplam kadro piyasa değeri (eur). */
export async function getFeaturedTeamMarketValueMap(): Promise<Map<number, number>> {
  return getTeamValues("at.\"leagueSourceId\" = ANY($1::int[])", FEATURED_LEAGUE_IDS)
}

/** leagueId -> ligdeki tüm eşleşmiş oyuncuların piyasa değeri toplamı (eur). */
export async function getFeaturedLeagueMarketValueMap(): Promise<Map<number, number>> {
  return withFallback(async () => {
    const result = await pool.query<{ leagueId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT at."leagueSourceId" AS "leagueId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
      ${MATCHED_PLAYERS_FROM}
      WHERE at."leagueSourceId" = ANY($1::int[])
      GROUP BY at."leagueSourceId"
    `, [FEATURED_LEAGUE_IDS])
    return new Map(result.rows.map((row) => [row.leagueId, numberOrZero(row.total)]))
  }, new Map<number, number>())
}

export async function getPlayerMarketValuesByTeamIds(teamIds: number[]): Promise<FeaturedPlayerMarketValueEntry[]> {
  const ids = uniqueIds(teamIds)
  if (!ids.length) return []
  return withFallback(async () => {
    const result = await pool.query<PlayerValueRow>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."sourceId" AS "playerId", ap.name AS "playerName",
             tp.name AS "fullName", ap."teamSourceId" AS "teamId",
             at.name AS "teamName", tp."marketValueEur" AS "valueEur"
      ${MATCHED_PLAYERS_FROM}
      WHERE ap."teamSourceId" = ANY($1::int[])
    `, [ids])
    return toPlayerEntries(result.rows)
  }, [])
}

export async function getTeamMarketValueMapByTeamIds(teamIds: number[]): Promise<Map<number, number>> {
  const ids = uniqueIds(teamIds)
  if (!ids.length) return new Map()
  return getTeamValues("ap.\"teamSourceId\" = ANY($1::int[])", ids)
}

export async function getPlayerMarketValueMapByIds(playerIds: number[]): Promise<Map<number, number>> {
  const ids = uniqueIds(playerIds)
  if (!ids.length) return new Map()
  return withFallback(async () => {
    const result = await pool.query<{ playerId: number; valueEur: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."sourceId" AS "playerId", tp."marketValueEur" AS "valueEur"
      ${MATCHED_PLAYERS_FROM}
      WHERE ap."sourceId" = ANY($1::int[])
        AND tp."marketValueEur" IS NOT NULL
    `, [ids])
    return new Map(result.rows.map((row) => [row.playerId, numberOrZero(row.valueEur)]))
  }, new Map<number, number>())
}

/** Eski çağrı sözleşmelerinin merkezi snapshot karşılıkları. */
export const getPlayerMarketValues = getPlayerMarketValueMapByIds
export const getTeamMarketValues = getTeamMarketValueMapByTeamIds

export async function getPlayerMarketValue(playerId: number): Promise<number | null> {
  return (await getPlayerMarketValueMapByIds([playerId])).get(playerId) ?? null
}

export async function getTeamMarketValue(teamId: number): Promise<number | null> {
  return (await getTeamMarketValueMapByTeamIds([teamId])).get(teamId) ?? null
}

export async function getLeagueMarketValue(leagueId: number): Promise<number | null> {
  const values = await getLeagueMarketValueMapByLeagueIds([leagueId])
  return values.get(leagueId) ?? null
}

export async function getLeagueMarketValueMapByLeagueIds(leagueIds: number[]): Promise<Map<number, number>> {
  const ids = uniqueIds(leagueIds)
  if (!ids.length) return new Map()
  return withFallback(async () => {
    const result = await pool.query<{ leagueId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT at."leagueSourceId" AS "leagueId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
      ${MATCHED_PLAYERS_FROM}
      WHERE at."leagueSourceId" = ANY($1::int[])
      GROUP BY at."leagueSourceId"
    `, [ids])
    return new Map(result.rows.map((row) => [row.leagueId, numberOrZero(row.total)]))
  }, new Map<number, number>())
}

export interface MatchedPlayerSnapshotEntry extends FeaturedPlayerMarketValueEntry {
  leagueId: number
  detailedPosition: string | null
}

/** Oyunlar için değer, takım, lig ve mevkiyi aynı eşleşmiş snapshot satırından döndürür. */
export async function getMatchedPlayerSnapshotsByIds(playerIds: number[]): Promise<MatchedPlayerSnapshotEntry[]> {
  const ids = uniqueIds(playerIds)
  if (!ids.length) return []
  return withFallback(async () => {
    const result = await pool.query<PlayerValueRow & { leagueId: number; detailedPosition: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."sourceId" AS "playerId", ap.name AS "playerName",
             tp.name AS "fullName", ap."teamSourceId" AS "teamId",
             at.name AS "teamName", at."leagueSourceId" AS "leagueId",
             tp."marketValueEur" AS "valueEur", tp."detailedPosition"
      ${MATCHED_PLAYERS_FROM}
      WHERE ap."sourceId" = ANY($1::int[])
    `, [ids])
    return result.rows.map((row) => ({
      ...toPlayerEntries([row])[0],
      leagueId: row.leagueId,
      detailedPosition: row.detailedPosition,
    }))
  }, [])
}

async function getTeamValues(where: string, values: number[]): Promise<Map<number, number>> {
  return withFallback(async () => {
    const result = await pool.query<{ teamId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."teamSourceId" AS "teamId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
      ${MATCHED_PLAYERS_FROM}
      WHERE ${where}
      GROUP BY ap."teamSourceId"
    `, [values])
    return new Map(result.rows.map((row) => [row.teamId, numberOrZero(row.total)]))
  }, new Map<number, number>())
}
