import { eq, inArray } from "drizzle-orm"
import { db } from "./db"
import { playerMarketValue, teamMarketValue } from "./db/schema"

export { formatMarketValueEur } from "./market-value-format"

export interface TeamMarketValueInfo {
  totalValueEur: number | null
}

export interface PlayerMarketValueInfo {
  valueEur: number | null
}

export async function getTeamMarketValue(teamId: number): Promise<TeamMarketValueInfo | null> {
  const rows = await db
    .select({ totalValueEur: teamMarketValue.totalValueEur })
    .from(teamMarketValue)
    .where(eq(teamMarketValue.teamId, teamId))
    .limit(1)

  if (rows.length === 0) return null
  return { totalValueEur: rows[0].totalValueEur !== null ? Number(rows[0].totalValueEur) : null }
}

export async function getPlayerMarketValue(playerId: number): Promise<PlayerMarketValueInfo | null> {
  const rows = await db
    .select({ valueEur: playerMarketValue.valueEur })
    .from(playerMarketValue)
    .where(eq(playerMarketValue.playerId, playerId))
    .limit(1)

  if (rows.length === 0) return null
  return { valueEur: rows[0].valueEur !== null ? Number(rows[0].valueEur) : null }
}

export async function getTeamMarketValues(teamIds: number[]): Promise<Map<number, TeamMarketValueInfo>> {
  const result = new Map<number, TeamMarketValueInfo>()
  if (teamIds.length === 0) return result

  const rows = await db
    .select({ teamId: teamMarketValue.teamId, totalValueEur: teamMarketValue.totalValueEur })
    .from(teamMarketValue)
    .where(inArray(teamMarketValue.teamId, teamIds))

  for (const row of rows) {
    result.set(row.teamId, {
      totalValueEur: row.totalValueEur !== null ? Number(row.totalValueEur) : null,
    })
  }
  return result
}

export async function getPlayerMarketValues(playerIds: number[]): Promise<Map<number, PlayerMarketValueInfo>> {
  const result = new Map<number, PlayerMarketValueInfo>()
  if (playerIds.length === 0) return result

  const rows = await db
    .select({ playerId: playerMarketValue.playerId, valueEur: playerMarketValue.valueEur })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.playerId, playerIds))

  for (const row of rows) {
    result.set(row.playerId, {
      valueEur: row.valueEur !== null ? Number(row.valueEur) : null,
    })
  }
  return result
}
