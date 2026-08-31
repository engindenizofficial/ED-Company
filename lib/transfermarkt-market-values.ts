import { pool } from "@/lib/db"

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function safely<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query()
  } catch {
    return fallback
  }
}

export async function getPlayerMarketValues(apiPlayerIds: number[]): Promise<Map<number, number>> {
  const ids = [...new Set(apiPlayerIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (!ids.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ apiPlayerId: number; marketValueEur: string | null }>(`
      WITH latest AS (
        SELECT id, "transfermarktRunId", "apiFootballRunId"
        FROM player_match_run
        WHERE status = 'completed'
        ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      )
      SELECT r."apiFootballPlayerId" AS "apiPlayerId", p."marketValueEur" AS "marketValueEur"
      FROM latest l
      JOIN player_match_result r ON r."matchRunId" = l.id
      JOIN transfermarkt_player_snapshot p
        ON p."sourceId" = r."transfermarktPlayerId" AND p."runId" = l."transfermarktRunId"
      WHERE r."apiFootballPlayerId" = ANY($1::int[])
        AND r."matchedLevel" <> 'unmatched'
        AND p."marketValueEur" IS NOT NULL
    `, [ids])

    return new Map(result.rows.flatMap((row) => {
      const value = toNumber(row.marketValueEur)
      return value == null ? [] : [[row.apiPlayerId, value] as const]
    }))
  }, new Map<number, number>())
}

export async function getPlayerMarketValue(apiPlayerId: number): Promise<number | null> {
  return (await getPlayerMarketValues([apiPlayerId])).get(apiPlayerId) ?? null
}

export async function getTeamMarketValues(apiTeamIds: number[]): Promise<Map<number, number>> {
  const ids = [...new Set(apiTeamIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (!ids.length) return new Map()

  return safely(async () => {
    const result = await pool.query<{ apiTeamId: number; marketValueEur: string | null }>(`
      WITH latest AS (
        SELECT id, "transfermarktRunId", "apiFootballRunId"
        FROM player_match_run
        WHERE status = 'completed'
        ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      ), candidates AS (
        SELECT ap."teamSourceId" AS "apiTeamId", tp."teamSourceId" AS "tmTeamId", COUNT(*) AS matches,
          ROW_NUMBER() OVER (PARTITION BY ap."teamSourceId" ORDER BY COUNT(*) DESC, tp."teamSourceId") AS rank
        FROM latest l
        JOIN player_match_result r ON r."matchRunId" = l.id AND r."matchedLevel" <> 'unmatched'
        JOIN api_football_player_snapshot ap
          ON ap."sourceId" = r."apiFootballPlayerId" AND ap."runId" = l."apiFootballRunId"
        JOIN transfermarkt_player_snapshot tp
          ON tp."sourceId" = r."transfermarktPlayerId" AND tp."runId" = l."transfermarktRunId"
        WHERE ap."teamSourceId" = ANY($1::int[])
        GROUP BY ap."teamSourceId", tp."teamSourceId"
      )
      SELECT c."apiTeamId", checkpoint.metadata->>'marketValueEur' AS "marketValueEur"
      FROM candidates c
      JOIN latest l ON true
      JOIN data_import_checkpoint checkpoint
        ON checkpoint."runId" = l."transfermarktRunId"
        AND checkpoint.source = 'transfermarkt'
        AND checkpoint.kind = 'team'
        AND checkpoint."itemKey" = c."tmTeamId"
        AND checkpoint.status = 'completed'
      WHERE c.rank = 1
    `, [ids])

    return new Map(result.rows.flatMap((row) => {
      const value = toNumber(row.marketValueEur)
      return value == null ? [] : [[row.apiTeamId, value] as const]
    }))
  }, new Map<number, number>())
}

export async function getTeamMarketValue(apiTeamId: number): Promise<number | null> {
  return (await getTeamMarketValues([apiTeamId])).get(apiTeamId) ?? null
}

export async function getLeagueMarketValue(apiLeagueId: number): Promise<number | null> {
  return safely(async () => {
    const result = await pool.query<{ marketValueEur: string | null }>(`
      WITH latest AS (
        SELECT id, "transfermarktRunId", "apiFootballRunId"
        FROM player_match_run
        WHERE status = 'completed'
        ORDER BY "finishedAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      ), candidates AS (
        SELECT tt."leagueSourceId" AS "tmLeagueId", COUNT(*) AS matches
        FROM latest l
        JOIN player_match_result r ON r."matchRunId" = l.id AND r."matchedLevel" <> 'unmatched'
        JOIN api_football_player_snapshot ap
          ON ap."sourceId" = r."apiFootballPlayerId" AND ap."runId" = l."apiFootballRunId"
        JOIN api_football_team_snapshot at
          ON at."sourceId" = ap."teamSourceId" AND at."runId" = l."apiFootballRunId"
        JOIN transfermarkt_player_snapshot tp
          ON tp."sourceId" = r."transfermarktPlayerId" AND tp."runId" = l."transfermarktRunId"
        JOIN transfermarkt_team_snapshot tt
          ON tt."sourceId" = tp."teamSourceId" AND tt."runId" = l."transfermarktRunId"
        WHERE at."leagueSourceId" = $1
        GROUP BY tt."leagueSourceId"
        ORDER BY matches DESC, tt."leagueSourceId"
        LIMIT 1
      )
      SELECT checkpoint.metadata->>'marketValueEur' AS "marketValueEur"
      FROM candidates c
      JOIN latest l ON true
      JOIN data_import_checkpoint checkpoint
        ON checkpoint."runId" = l."transfermarktRunId"
        AND checkpoint.source = 'transfermarkt'
        AND checkpoint.kind = 'league'
        AND checkpoint."itemKey" = c."tmLeagueId"
        AND checkpoint.status = 'completed'
    `, [apiLeagueId])
    return toNumber(result.rows[0]?.marketValueEur)
  }, null)
}
