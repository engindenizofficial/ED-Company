export const PLAYER_POSITIONS = ["GK", "LB", "CB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "CF", "ST"] as const
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number]
export type PositionProfile = { primary: PlayerPosition | null }

const ALIASES: Record<string, PlayerPosition> = {
  GK: "GK", Goalkeeper: "GK", Torwart: "GK",
  LB: "LB", "Left Back": "LB", "Left-Back": "LB", "Left back": "LB",
  CB: "CB", "Centre Back": "CB", "Center Back": "CB", "Centre-Back": "CB", "Center-Back": "CB", Sweeper: "CB", Libero: "CB",
  RB: "RB", "Right Back": "RB", "Right-Back": "RB", "Right back": "RB",
  DM: "DM", "Defensive Midfield": "DM", "Defensive Midfielder": "DM",
  CM: "CM", "Central Midfield": "CM", "Central Midfielder": "CM", Midfielder: "CM",
  AM: "AM", "Attacking Midfield": "AM", "Attacking Midfielder": "AM",
  LM: "LM", "Left Midfield": "LM", "Left Midfielder": "LM",
  RM: "RM", "Right Midfield": "RM", "Right Midfielder": "RM",
  LW: "LW", "Left Winger": "LW", "Left Wing": "LW",
  RW: "RW", "Right Winger": "RW", "Right Wing": "RW",
  CF: "CF", "Second Striker": "CF", "Second striker": "CF",
  ST: "ST", Striker: "ST", Attacker: "ST", "Centre-Forward": "ST", "Center-Forward": "ST", "Centre Forward": "ST",
}

export function normalizePosition(value: string | null | undefined): PlayerPosition | null {
  return value ? ALIASES[value.trim()] ?? null : null
}

export function profile(primary: string | null | undefined): PositionProfile {
  return { primary: normalizePosition(primary) }
}

export function fit(player: PositionProfile | null | undefined, slot: PlayerPosition): number {
  if (!player?.primary) return 0.72
  if (player.primary === slot) return 1
  const adjacent: Partial<Record<PlayerPosition, PlayerPosition[]>> = {
    LB: ["CB", "LM"], CB: ["LB", "RB", "DM"], RB: ["CB", "RM"], DM: ["CM", "CB"],
    CM: ["DM", "AM", "LM", "RM"], AM: ["CM", "CF"], LM: ["LB", "LW", "CM"],
    RM: ["RB", "RW", "CM"], LW: ["LM", "AM"], RW: ["RM", "AM"], CF: ["ST", "AM"], ST: ["CF"],
  }
  return adjacent[player.primary]?.includes(slot) ? 0.86 : 0.68
}

export function ratingAtPosition(base: number, player: PositionProfile | null | undefined, slot: PlayerPosition): number {
  return Math.max(1, Math.min(99, Math.round(base * fit(player, slot))))
}

export function positionLabel(position: PlayerPosition): string {
  return ({ GK: "Kaleci", LB: "Sol Bek", CB: "Stoper", RB: "Sağ Bek", DM: "Defansif Orta Saha", CM: "Merkez Orta Saha", AM: "Ofansif Orta Saha", LM: "Sol Orta Saha", RM: "Sağ Orta Saha", LW: "Sol Kanat", RW: "Sağ Kanat", CF: "Forvet Arkası", ST: "Santrfor" })[position]
}

export function hasVerifiedPosition(player: PositionProfile | null | undefined): boolean {
  return Boolean(player?.primary)
}

export function isPlayerPosition(value: string): value is PlayerPosition {
  return (PLAYER_POSITIONS as readonly string[]).includes(value)
}

export function positionSummary(player: PositionProfile | null | undefined): string {
  return player?.primary ?? "Mevki doğrulanmadı"
}

export const POSITION_GROUPS = { defense: ["LB", "CB", "RB"], midfield: ["DM", "CM", "AM", "LM", "RM"], attack: ["LW", "RW", "CF", "ST"] } as const
