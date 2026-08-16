import { NextResponse } from "next/server"
import { and, eq, gte } from "drizzle-orm"
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
      recentMatches: playerPower.recentMatches,
      lastFormUpdateAt: playerPower.lastFormUpdateAt,
    })
    .from(playerPower)
    .leftJoin(playerMarketValue, eq(playerMarketValue.playerId, playerPower.playerId))
    .leftJoin(teamMarketValue, eq(teamMarketValue.teamId, playerPower.teamId))
    .where(
      and(
        gte(playerPower.lastFormUpdateAt, since),
      ),
    )
    .orderBy(playerPower.formModifier)

  return NextResponse.json({
    players: rows
      .filter((row) => row.currentPower !== null)
      .map((row) => {
        const matches = Array.isArray(row.recentMatches) ? row.recentMatches as Array<{
          fixtureId?: number
          teamName?: string
          date?: string
          rating?: number | null
          goals?: number
          assists?: number
          minutes?: number
        }> : []
        const latestMatch = matches.find((match) => match.date && new Date(match.date).getTime() >= since.getTime()) ?? matches[0]
        const change = row.formModifier
        return {
          id: row.playerId,
          name: row.playerName ?? row.fallbackName ?? `Player ${row.playerId}`,
          teamName: latestMatch?.teamName ?? row.teamName,
          previousPower: Math.max(1, Math.min(99, row.currentPower! - change)),
          currentPower: row.currentPower!,
          change,
          updatedAt: row.lastFormUpdateAt,
          match: latestMatch ? {
            fixtureId: latestMatch.fixtureId ?? null,
            date: latestMatch.date ?? null,
            rating: latestMatch.rating ?? null,
            goals: latestMatch.goals ?? 0,
            assists: latestMatch.assists ?? 0,
            minutes: latestMatch.minutes ?? 0,
          } : null,
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
  match: {
    fixtureId: number | null
    date: string | null
    rating: number | null
    goals: number
    assists: number
    minutes: number
  } | null
}
