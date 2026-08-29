export const PLAYER_POSITIONS = ["GK", "LB", "CB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "CF", "ST"] as const
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number]
export type PositionSource = "api-football" | "external" | "unverified"
export type PositionProfile = { primary: PlayerPosition | null; secondary: PlayerPosition[]; source: PositionSource }

const ALIASES: Record<string, PlayerPosition> = {
  GK: "GK", Goalkeeper: "GK", Torwart: "GK",
  LB: "LB", "Left Back": "LB", "Left-Back": "LB", "Left back": "LB",
  CB: "CB", "Centre Back": "CB", "Center Back": "CB", "Centre-Back": "CB", "Center-Back": "CB", Sweeper: "CB", Libero: "CB",
  RB: "RB", "Right Back": "RB", "Right-Back": "RB", "Right back": "RB",
  DM: "DM", "Defensive Midfielder": "DM", "Defensive Midfield": "DM",
  CM: "CM", "Central Midfielder": "CM", "Central Midfield": "CM", Midfielder: "CM",
  AM: "AM", "Attacking Midfielder": "AM", "Attacking Midfield": "AM",
  LM: "LM", "Left Midfielder": "LM", "Left Midfield": "LM",
  RM: "RM", "Right Midfielder": "RM", "Right Midfield": "RM",
  LW: "LW", "Left Winger": "LW", "Left Wing": "LW",
  RW: "RW", "Right Winger": "RW", "Right Wing": "RW",
  CF: "CF", "Second Striker": "CF", "Second striker": "CF",
  ST: "ST", Striker: "ST", Attacker: "ST", "Centre-Forward": "ST", "Center-Forward": "ST", "Centre Forward": "ST",
}

export function normalizePosition(value: string | null | undefined): PlayerPosition | null { return value ? ALIASES[value.trim()] ?? null : null }
export function profile(primary: string | null | undefined, secondary: string[] = [], source: PositionSource = "unverified"): PositionProfile { return { primary: normalizePosition(primary), secondary: [...new Set(secondary.map(normalizePosition).filter((p): p is PlayerPosition => Boolean(p)))], source } }
export function fit(profile: PositionProfile | null | undefined, slot: PlayerPosition): number { if (!profile?.primary && !profile?.secondary.length) return 0.72; if (profile.primary === slot || profile.secondary.includes(slot)) return 1; const adjacent: Partial<Record<PlayerPosition, PlayerPosition[]>> = { LB: ["CB", "LM"], CB: ["LB", "RB", "DM"], RB: ["CB", "RM"], DM: ["CM", "CB"], CM: ["DM", "AM", "LM", "RM"], AM: ["CM", "CF"], LM: ["LB", "LW", "CM"], RM: ["RB", "RW", "CM"], LW: ["LM", "AM"], RW: ["RM", "AM"], CF: ["ST", "AM"], ST: ["CF"] }; return profile.primary && adjacent[profile.primary]?.includes(slot) ? 0.86 : 0.68 }
export function ratingAtPosition(base: number, player: PositionProfile | null | undefined, slot: PlayerPosition): number { return Math.max(1, Math.min(99, Math.round(base * fit(player, slot)))) }
export function positionLabel(position: PlayerPosition): string { return ({ GK: "Kaleci", LB: "Sol Bek", CB: "Stoper", RB: "Sağ Bek", DM: "Defansif Orta Saha", CM: "Merkez Orta Saha", AM: "Ofansif Orta Saha", LM: "Sol Orta Saha", RM: "Sağ Orta Saha", LW: "Sol Kanat", RW: "Sağ Kanat", CF: "Forvet Arkası", ST: "Santrfor" })[position] }
export function rolePositions(role: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"): PlayerPosition[] { return role === "Goalkeeper" ? ["GK"] : role === "Defender" ? ["LB", "CB", "RB"] : role === "Midfielder" ? ["DM", "CM", "AM", "LM", "RM"] : ["LW", "RW", "CF", "ST"] }
export function roleForPosition(position: PlayerPosition): "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" { return position === "GK" ? "Goalkeeper" : ["LB", "CB", "RB"].includes(position) ? "Defender" : ["DM", "CM", "AM", "LM", "RM"].includes(position) ? "Midfielder" : "Attacker" }
export function hasVerifiedPosition(player: PositionProfile | null | undefined): boolean { return Boolean(player?.primary || player?.secondary.length) && player?.source !== "unverified" }
export function isPlayerPosition(value: string): value is PlayerPosition { return (PLAYER_POSITIONS as readonly string[]).includes(value) }
export function positionSummary(player: PositionProfile | null | undefined): string { return [player?.primary, ...(player?.secondary ?? [])].filter(Boolean).join("/") || "Mevki doğrulanmadı" }
export function sourceLabel(source: PositionSource): string { return source === "api-football" ? "API-Football" : source === "external" ? "Harici veri" : "Doğrulanmamış" }
export const POSITION_GROUPS = { defense: ["LB", "CB", "RB"], midfield: ["DM", "CM", "AM", "LM", "RM"], attack: ["LW", "RW", "CF", "ST"] } as const
