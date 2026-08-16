import { NextResponse } from "next/server"
import { and, eq, gte, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerMarketValue, playerPower, teamMarketValue } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export async function GET() {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000)
  const rows = await db
    .select({
      playerId: playerPower.playerId,
      playerName: playerMarketValue.fullName,
      fallbackName: playerMarketValue.playerName,
      teamName: teamMarketValue.teamName,
      currentPower: playerPower.currentPower,
      formModifier: playerPower.formModifier,
      lastFormUpdateAt: playerPower.lastFormUpdateAt,
    })
    .from(playerPower)
    .leftJoin(playerMarketValue, eq(playerMarketValue.playerId, playerPower.playerId))
    .leftJoin(teamMarketValue, eq(teamMarketValue.teamId, playerPower.teamId))
    .where(
      and(
        gte(playerPower.lastFormUpdateAt, since),
        ne(playerPower.formModifier, 0),
      ),
    )
    .orderBy(playerPower.formModifier)

  return NextResponse.json({
    players: rows
      .filter((row) => row.currentPower !== null)
      .map((row) => {
        const change = row.formModifier
        return {
          id: row.playerId,
          name: row.playerName ?? row.fallbackName ?? `Player ${row.playerId}`,
          teamName: row.teamName,
          previousPower: Math.max(1, Math.min(99, row.currentPower! - change)),
          currentPower: row.currentPower!,
          change,
          updatedAt: row.lastFormUpdateAt,
        }
      })
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
  })
}

export type MomentumPlayer = {
  id: number
  name: string
  teamName: string | null
  previousPower: number
  currentPower: number
  change: number
  updatedAt: string | Date | null
}
