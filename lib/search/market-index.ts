import { pool } from "@/lib/db"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function safely<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query()
  } catch {
    return fallback
  }
}

const LATEST_COMPLETED_MATCH_RUN = `
  SELECT id, "transfermarktRunId", "apiFootballRunId"
  FROM player_match_run
  WHERE status = 'completed'
  ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
  LIMIT 1
`

/** teamId -> toplam kadro piyasa değeri (eur). Kayıt yoksa/null ise 0 kabul edilir. */
export async function getFeaturedTeamMarketValueMap(): Promise<Map<number, number>> {
  return getTeamMarketValuesByLeagueIds(FEATURED_LEAGUE_IDS)
}

/** leagueId -> ligdeki eşleşmiş oyuncuların piyasa değeri toplamı (eur). */
export async function getFeaturedLeagueMarketValueMap(): Promise<Map<number, number>> {
  if (!FEATURED_LEAGUE_IDS.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ leagueId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT at."leagueSourceId" AS "leagueId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
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
      WHERE at."leagueSourceId" = ANY($1::int[])
      GROUP BY at."leagueSourceId"
    `, [FEATURED_LEAGUE_IDS])

    return new Map(result.rows.map((row) => [row.leagueId, toNumber(row.total)]))
  }, new Map<number, number>())
}

export interface FeaturedPlayerMarketValueEntry {
  playerId: number
  playerName: string
  teamId: number
  valueEur: number
}

/**
 * Son tamamlanmış eşleştirme koşusundaki oyuncuları API-Football kimliği ve
 * takımıyla, aynı eşleştirme satırındaki Transfermarkt piyasa değeriyle döner.
 */
export async function getPlayerMarketValuesByTeamIds(
  teamIds: number[],
): Promise<FeaturedPlayerMarketValueEntry[]> {
  const ids = uniquePositiveIntegers(teamIds)
  if (!ids.length) return []

  return safely(async () => {
    const result = await pool.query<{
      playerId: number
      playerName: string
      teamId: number
      valueEur: string | null
    }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."sourceId" AS "playerId", ap.name AS "playerName",
             ap."teamSourceId" AS "teamId", tp."marketValueEur" AS "valueEur"
      FROM latest l
      JOIN player_match_result r
        ON r."matchRunId" = l.id
       AND r."matchedLevel" <> 'unmatched'
       AND r."apiFootballPlayerId" IS NOT NULL
      JOIN api_football_player_snapshot ap
        ON ap."sourceId" = r."apiFootballPlayerId"
       AND ap."runId" = l."apiFootballRunId"
      JOIN transfermarkt_player_snapshot tp
        ON tp."sourceId" = r."transfermarktPlayerId"
       AND tp."runId" = l."transfermarktRunId"
      WHERE ap."teamSourceId" = ANY($1::int[])
    `, [ids])

    return result.rows.map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      teamId: row.teamId,
      valueEur: toNumber(row.valueEur),
    }))
  }, [])
}

/** Verilen teamId'lerin eşleşmiş oyuncu değerleri toplamını döner. */
export async function getTeamMarketValueMapByTeamIds(teamIds: number[]): Promise<Map<number, number>> {
  const ids = uniquePositiveIntegers(teamIds)
  if (!ids.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ teamId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."teamSourceId" AS "teamId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
      FROM latest l
      JOIN player_match_result r
        ON r."matchRunId" = l.id
       AND r."matchedLevel" <> 'unmatched'
       AND r."apiFootballPlayerId" IS NOT NULL
      JOIN api_football_player_snapshot ap
        ON ap."sourceId" = r."apiFootballPlayerId"
       AND ap."runId" = l."apiFootballRunId"
      JOIN transfermarkt_player_snapshot tp
        ON tp."sourceId" = r."transfermarktPlayerId"
       AND tp."runId" = l."transfermarktRunId"
      WHERE ap."teamSourceId" = ANY($1::int[])
      GROUP BY ap."teamSourceId"
    `, [ids])

    return new Map(result.rows.map((row) => [row.teamId, toNumber(row.total)]))
  }, new Map<number, number>())
}

/** playerId -> piyasa değeri (eur). Kayıt yoksa Map'te bulunmaz. */
export async function getPlayerMarketValueMapByIds(playerIds: number[]): Promise<Map<number, number>> {
  const ids = uniquePositiveIntegers(playerIds)
  if (!ids.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ playerId: number; valueEur: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT r."apiFootballPlayerId" AS "playerId", tp."marketValueEur" AS "valueEur"
      FROM latest l
      JOIN player_match_result r
        ON r."matchRunId" = l.id
       AND r."matchedLevel" <> 'unmatched'
       AND r."apiFootballPlayerId" IS NOT NULL
      JOIN api_football_player_snapshot ap
        ON ap."sourceId" = r."apiFootballPlayerId"
       AND ap."runId" = l."apiFootballRunId"
      JOIN transfermarkt_player_snapshot tp
        ON tp."sourceId" = r."transfermarktPlayerId"
       AND tp."runId" = l."transfermarktRunId"
      WHERE r."apiFootballPlayerId" = ANY($1::int[])
    `, [ids])

    return new Map(result.rows.map((row) => [row.playerId, toNumber(row.valueEur)]))
  }, new Map<number, number>())
}

async function getTeamMarketValuesByLeagueIds(leagueIds: number[]): Promise<Map<number, number>> {
  const ids = uniquePositiveIntegers(leagueIds)
  if (!ids.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ teamId: number; total: string | null }>(`
      WITH latest AS (${LATEST_COMPLETED_MATCH_RUN})
      SELECT ap."teamSourceId" AS "teamId", COALESCE(SUM(tp."marketValueEur"), 0) AS total
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
      WHERE at."leagueSourceId" = ANY($1::int[])
      GROUP BY ap."teamSourceId"
    `, [ids])

    return new Map(result.rows.map((row) => [row.teamId, toNumber(row.total)]))
  }, new Map<number, number>())
}

function uniquePositiveIntegers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}
