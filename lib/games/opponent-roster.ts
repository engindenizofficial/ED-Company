import { getSquad } from "@/lib/api-football"
import { db } from "@/lib/db"
import { playerMarketValue, playerPower } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import { computeLivePowerFromMarketValue } from "@/lib/player-power"
import { PLAYER_ROLES, type PlayerRole } from "@/lib/games/manager-career"

/**
 * Mevki gücü backfill'i (bkz. lib/player-position-sync.ts) henüz bu oyuncuya
 * ulaşmamışsa VEYA piyasa değeri DB'sinde satırı yoksa (yeni transfer,
 * gençlik takımı vb.) kullanılan taban güç. Takım gücünü tamamen sıfıra
 * düşürmemek için nötr-altı bir değer.
 */
const DEFAULT_FALLBACK_POWER = 45

export interface RosterPlayer {
  id: number
  name: string
  /** Ham API-Football mevki kategorisi: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" */
  role: PlayerRole
  /** 1-99 arası güç puanı */
  power: number
}

export interface TeamStrength {
  defense: number
  midfield: number
  attack: number
  overall: number
}

/** Her grup için, ortalamaya girecek en güçlü oyuncu sayısı — yaklaşık bir başlangıç 11'i temsil eder. */
const TOP_N_PER_GROUP: Record<"defense" | "midfield" | "attack", number> = {
  defense: 5,
  midfield: 4,
  attack: 3,
}

function averageTopN(powers: number[], n: number): number {
  if (powers.length === 0) return DEFAULT_FALLBACK_POWER
  const sorted = [...powers].sort((a, b) => b - a).slice(0, n)
  return sorted.reduce((sum, p) => sum + p, 0) / sorted.length
}

/**
 * Bir gerçek (API-Football) takımın kadrosunu, piyasa değeri ve güç motoru
 * verisiyle birleştirip RosterPlayer[] olarak döner. Menajer kariyeri oyuncu
 * aramasındaki (`players/search/route.ts`) mantığın basitleştirilmiş bir
 * türevidir — burada isim eşleştirmesi gerekmediğinden (doğrudan teamId ile
 * kadro çekiliyor) candidate-cache / fallback tekil sorgu adımları yok.
 */
export async function getTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  const squad = await getSquad(teamId)
  if (squad.length === 0) return []

  const ids = squad.map((p) => p.id)
  const [marketRows, powerRows] = await Promise.all([
    db
      .select({ playerId: playerMarketValue.playerId, valueEur: playerMarketValue.valueEur })
      .from(playerMarketValue)
      .where(inArray(playerMarketValue.playerId, ids)),
    db
      .select({ playerId: playerPower.playerId, currentPower: playerPower.currentPower })
      .from(playerPower)
      .where(inArray(playerPower.playerId, ids)),
  ])

  const valueByPlayerId = new Map(marketRows.map((r) => [r.playerId, r.valueEur !== null ? Number(r.valueEur) : null]))
  const powerByPlayerId = new Map(powerRows.map((r) => [r.playerId, r.currentPower]))

  return squad
    .filter((p) => p.id > 0 && p.name)
    .map((p) => {
      const valueEur = valueByPlayerId.get(p.id) ?? null
      const power = powerByPlayerId.get(p.id) ?? computeLivePowerFromMarketValue(valueEur) ?? DEFAULT_FALLBACK_POWER
      const role: PlayerRole = p.pos && PLAYER_ROLES.includes(p.pos as PlayerRole) ? (p.pos as PlayerRole) : "Midfielder"
      return { id: p.id, name: p.name, role, power }
    })
}

/**
 * Bir kadronun (gerçek takım ya da kullanıcının 11'i) defans/orta saha/hücum
 * ve genel gücünü, her grubun en güçlü oyuncularının ortalamasıyla hesaplar.
 * Kaleciler defans grubuna dahil edilir (klasik "defensive third" mantığı).
 */
export function groupStrengthFromRoster(roster: RosterPlayer[]): TeamStrength {
  const defensePowers = roster.filter((p) => p.role === "Goalkeeper" || p.role === "Defender").map((p) => p.power)
  const midfieldPowers = roster.filter((p) => p.role === "Midfielder").map((p) => p.power)
  const attackPowers = roster.filter((p) => p.role === "Attacker").map((p) => p.power)

  const defense = averageTopN(defensePowers, TOP_N_PER_GROUP.defense)
  const midfield = averageTopN(midfieldPowers, TOP_N_PER_GROUP.midfield)
  const attack = averageTopN(attackPowers, TOP_N_PER_GROUP.attack)
  const overall = (defense + midfield + attack) / 3

  return { defense, midfield, attack, overall }
}
