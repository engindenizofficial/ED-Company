import { getSquad } from "@/lib/api-football"
import { db } from "@/lib/db"
import { playerMarketValue, playerPosition, playerPower } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import { computeLivePowerFromMarketValue } from "@/lib/player-power"
import { isPlayerPosition, type PlayerPosition } from "@/lib/player-positions"

const DEFAULT_FALLBACK_POWER = 45

export interface RosterPlayer {
  id: number
  name: string
  position: PlayerPosition
  power: number
}

export interface TeamStrength {
  defense: number
  midfield: number
  attack: number
  overall: number
}

const TOP_N_PER_GROUP = { defense: 5, midfield: 4, attack: 3 } as const
const DEFENSE = new Set<PlayerPosition>(["GK", "LB", "CB", "RB"])
const MIDFIELD = new Set<PlayerPosition>(["DM", "CM", "AM", "LM", "RM"])
const ATTACK = new Set<PlayerPosition>(["LW", "RW", "CF", "ST"])

function averageTopN(powers: number[], n: number): number {
  if (powers.length === 0) return DEFAULT_FALLBACK_POWER
  const sorted = [...powers].sort((a, b) => b - a).slice(0, n)
  return sorted.reduce((sum, power) => sum + power, 0) / sorted.length
}

export async function getTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  const squad = await getSquad(teamId)
  if (squad.length === 0) return []
  const ids = squad.map((player) => player.id)

  const [marketRows, powerRows, positionRows] = await Promise.all([
    db.select({ playerId: playerMarketValue.playerId, valueEur: playerMarketValue.valueEur })
      .from(playerMarketValue).where(inArray(playerMarketValue.playerId, ids)),
    db.select({ playerId: playerPower.playerId, power: playerPower.basePower })
      .from(playerPower).where(inArray(playerPower.playerId, ids)),
    db.select({ playerId: playerPosition.playerId, primary: playerPosition.mainPosition })
      .from(playerPosition).where(inArray(playerPosition.playerId, ids)),
  ])

  const values = new Map(marketRows.map((row) => [row.playerId, row.valueEur === null ? null : Number(row.valueEur)]))
  const powers = new Map(powerRows.map((row) => [row.playerId, row.power]))
  const positions = new Map(positionRows.map((row) => [row.playerId, row.primary]))

  return squad.flatMap((player) => {
    const position = positions.get(player.id)
    if (player.id <= 0 || !player.name || typeof position !== "string" || !isPlayerPosition(position)) return []
    const valueEur = values.get(player.id) ?? null
    const power = powers.get(player.id) ?? computeLivePowerFromMarketValue(valueEur) ?? DEFAULT_FALLBACK_POWER
    return [{ id: player.id, name: player.name, position, power }]
  })
}

export function groupStrengthFromRoster(roster: RosterPlayer[]): TeamStrength {
  const defense = averageTopN(roster.filter((p) => DEFENSE.has(p.position)).map((p) => p.power), TOP_N_PER_GROUP.defense)
  const midfield = averageTopN(roster.filter((p) => MIDFIELD.has(p.position)).map((p) => p.power), TOP_N_PER_GROUP.midfield)
  const attack = averageTopN(roster.filter((p) => ATTACK.has(p.position)).map((p) => p.power), TOP_N_PER_GROUP.attack)
  return { defense, midfield, attack, overall: (defense + midfield + attack) / 3 }
}
