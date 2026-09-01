import { db } from "@/lib/db"
import { managerTeamStrength, managerSquadPlayer } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { getTeamRoster, groupStrengthFromRoster, type RosterPlayer, type TeamStrength } from "@/lib/games/opponent-roster"
import { getFormationSlots } from "@/lib/games/manager-career"
import { computeLivePowerFromMarketValue } from "@/lib/player-power"
import { profile, ratingAtPosition, type PlayerPosition } from "@/lib/player-positions"

export type { TeamStrength, RosterPlayer } from "@/lib/games/opponent-roster"

function toTeamStrength(row: { defense: string; midfield: string; attack: string; overall: string }): TeamStrength {
  return {
    defense: Number(row.defense),
    midfield: Number(row.midfield),
    attack: Number(row.attack),
    overall: Number(row.overall),
  }
}

/**
 * Bir kariyerdeki gerçek (API-Football) bir takımın gücünü döner.
 * `manager_team_strength`'te önceden hesaplanmış satır varsa (sezon boyunca
 * gerçek takım kadroları sabit kabul edilir) direkt onu okur; yoksa
 * `getTeamRoster` ile hesaplayıp kaydeder.
 */
export async function getOrComputeTeamStrength(careerId: string, teamId: number): Promise<TeamStrength> {
  const existing = await db
    .select({
      defense: managerTeamStrength.defense,
      midfield: managerTeamStrength.midfield,
      attack: managerTeamStrength.attack,
      overall: managerTeamStrength.overall,
    })
    .from(managerTeamStrength)
    .where(and(eq(managerTeamStrength.careerId, careerId), eq(managerTeamStrength.teamId, teamId)))
    .limit(1)

  if (existing.length > 0) {
    return toTeamStrength(existing[0])
  }

  const roster = await getTeamRoster(teamId)
  const strength = groupStrengthFromRoster(roster)

  await db
    .insert(managerTeamStrength)
    .values({
      id: crypto.randomUUID(),
      careerId,
      teamId,
      defense: strength.defense.toFixed(2),
      midfield: strength.midfield.toFixed(2),
      attack: strength.attack.toFixed(2),
      overall: strength.overall.toFixed(2),
    })
    .onConflictDoNothing()

  return strength
}

/** Bir gerçek takımın kadrosunu (RosterPlayer[]) döner — maç olaylarında golcü/kart isimleri için. */
export async function getRealTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  return getTeamRoster(teamId)
}

/** Kullanıcının kariyerdeki başlangıç 11'ini, slota göre uygulanmış mevki gücüyle RosterPlayer[] olarak döner. */
export async function getUserSquadRoster(careerId: string, formationId: string): Promise<RosterPlayer[]> {
  const starters = await db
    .select({
      playerId: managerSquadPlayer.playerId,
      playerName: managerSquadPlayer.playerName,
      position: managerSquadPlayer.position,
      priceEur: managerSquadPlayer.priceEur,
      slotKey: managerSquadPlayer.slotKey,
    })
    .from(managerSquadPlayer)
    .where(and(eq(managerSquadPlayer.careerId, careerId), eq(managerSquadPlayer.role, "starting")))

  if (starters.length === 0) return []

  const playerIds = starters.map((s) => s.playerId)
  const positionResult = await db.execute(sql`
    with latest_match_run as (
      select id
      from player_match_run
      where status = 'completed'
      order by "finishedAt" desc nulls last, "createdAt" desc
      limit 1
    )
    select
      pmr."apiFootballPlayerId" as "playerId",
      tmp."detailedPosition" as "mainPosition"
    from player_match_result pmr
    inner join latest_match_run lmr on lmr.id = pmr."matchRunId"
    inner join transfermarkt_player_snapshot tmp on tmp."sourceId" = pmr."transfermarktPlayerId"
    where pmr."apiFootballPlayerId" in (${sql.join(playerIds, sql`, `)})
  `)

  const positionByPlayerId = new Map(
    (positionResult.rows as unknown as Array<{ playerId: number; mainPosition: string }>).map((r) => [
      Number(r.playerId),
      profile(r.mainPosition),
    ]),
  )
  const slotsByKey = new Map(getFormationSlots(formationId).map((s) => [s.key, s]))

  return starters.map((s) => {
    const basePower = computeLivePowerFromMarketValue(Number(s.priceEur)) ?? 45
    const slot = s.slotKey ? slotsByKey.get(s.slotKey) : null
    const positionProfile = positionByPlayerId.get(s.playerId) ?? null
    const power = slot ? ratingAtPosition(basePower, positionProfile, slot.position as PlayerPosition) : basePower
    return {
      id: s.playerId,
      name: s.playerName,
      position: positionProfile?.primary ?? "CM",
      power,
    }
  })
}

/** Kullanıcının kariyerdeki başlangıç 11'inin genel gücünü hesaplar (cache'lenmez — kadro değişebilir). */
export async function getUserSquadStrength(careerId: string, formationId: string): Promise<TeamStrength> {
  const roster = await getUserSquadRoster(careerId, formationId)
  return groupStrengthFromRoster(roster)
}
