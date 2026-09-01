// ---------------------------------------------------------------------------
// "Kulübünü Kur" (menajer kariyeri) oyunu — paylaşılan sabitler ve tipler.
// Hem istemci (sihirbaz bileşenleri) hem sunucu (API route, server action)
// tarafından import edilir; DB'ye bağımlı DEĞİLDİR.
// ---------------------------------------------------------------------------

export type ManagerDifficulty = "easy" | "normal" | "hard"

export interface DifficultySetting {
  id: ManagerDifficulty
  /** Başlangıç transfer bütçesi, tam euro. */
  budgetEur: number
  /** Rakip takımların güç çarpanı, % — ileride maç simülasyonunda kullanılacak. */
  opponentStrengthPercent: number
}

/**
 * Zorluk ayarları. "Kolay" en yüksek bütçe + en zayıf rakipler, "Zor" en düşük
 * bütçe + en güçlü rakiplerdir.
 */
export const DIFFICULTY_SETTINGS: Record<ManagerDifficulty, DifficultySetting> = {
  easy: { id: "easy", budgetEur: 1_000_000_000, opponentStrengthPercent: 80 },
  normal: { id: "normal", budgetEur: 750_000_000, opponentStrengthPercent: 100 },
  hard: { id: "hard", budgetEur: 500_000_000, opponentStrengthPercent: 120 },
}

export const MANAGER_DIFFICULTIES: ManagerDifficulty[] = ["easy", "normal", "hard"]

/** API-Football'ın ham mevki kategorileri — kadro kurma ekranında slot/oyuncu eşleşmesi bunlara göre yapılır. */
export type PlayerRole = "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"

export const PLAYER_ROLES: PlayerRole[] = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

/** public/images/manager-logos/ altındaki dosya adları — kulüp logosu seçim ekranı. */
export const CLUB_LOGO_FILES: string[] = Array.from(
  { length: 20 },
  (_, i) => `logo-${String(i + 1).padStart(2, "0")}.png`,
)

export const STARTING_XI_SIZE = 11
export const BENCH_SIZE = 7
export const SQUAD_SIZE = STARTING_XI_SIZE + BENCH_SIZE

// ---------------------------------------------------------------------------
// Diziliş (formasyon) tanımları.
//
// Her diziliş, kaleci hariç 10 saha oyuncusunu satır satır (defans/orta
// saha/forvet) gruplar. Bazı dizilişlerde orta saha iki farklı çizgiye
// bölünür (örn. 4-2-3-1 → önce 2 defansif orta, sonra 3 hücum orta) — ikisi
// de "Midfielder" rolüne eşlenir, sadece görsel Y konumu farklıdır.
//
// Koordinatlar yarı saha üzerinde yüzde (0-100): x=sol-sağ, y=0 orta hat
// (üst kenar) — y=100 kale çizgisi (alt kenar).
// ---------------------------------------------------------------------------

export interface FormationLine {
  role: PlayerRole
  count: number
  /** Yarı saha üzerindeki dikey konum, 0 (orta hat) - 100 (kale çizgisi). */
  y: number
}

export interface FormationDef {
  id: string
  /** Görsel satırlar, kaleden orta hatta doğru sırayla. */
  lines: FormationLine[]
}

export const FORMATIONS: FormationDef[] = [
  {
    id: "4-4-2",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 4, y: 72 },
      { role: "Midfielder", count: 4, y: 46 },
      { role: "Attacker", count: 2, y: 18 },
    ],
  },
  {
    id: "4-3-3",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 4, y: 72 },
      { role: "Midfielder", count: 3, y: 48 },
      { role: "Attacker", count: 3, y: 16 },
    ],
  },
  {
    id: "4-2-3-1",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 4, y: 74 },
      { role: "Midfielder", count: 2, y: 54 },
      { role: "Midfielder", count: 3, y: 32 },
      { role: "Attacker", count: 1, y: 12 },
    ],
  },
  {
    id: "3-5-2",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 3, y: 72 },
      { role: "Midfielder", count: 5, y: 44 },
      { role: "Attacker", count: 2, y: 16 },
    ],
  },
  {
    id: "5-3-2",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 5, y: 74 },
      { role: "Midfielder", count: 3, y: 46 },
      { role: "Attacker", count: 2, y: 16 },
    ],
  },
  {
    id: "3-4-3",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 3, y: 72 },
      { role: "Midfielder", count: 4, y: 46 },
      { role: "Attacker", count: 3, y: 16 },
    ],
  },
  {
    id: "4-1-4-1",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 4, y: 74 },
      { role: "Midfielder", count: 1, y: 56 },
      { role: "Midfielder", count: 4, y: 36 },
      { role: "Attacker", count: 1, y: 12 },
    ],
  },
  {
    id: "4-5-1",
    lines: [
      { role: "Goalkeeper", count: 1, y: 94 },
      { role: "Defender", count: 4, y: 72 },
      { role: "Midfielder", count: 5, y: 44 },
      { role: "Attacker", count: 1, y: 14 },
    ],
  },
]

export const DEFAULT_FORMATION_ID = "4-4-2"

import type { PlayerPosition } from "@/lib/player-positions"

export interface FormationSlot {
  /** Bu dizilişe özgü benzersiz anahtar, örn. "Defender-0-2". */
  key: string
  role: PlayerRole
  position: PlayerPosition
  x: number
  y: number
}

/** Bir dizilişin tüm slotlarını (rol + ekran koordinatı) üretir. */
export function getFormationSlots(formationId: string): FormationSlot[] {
  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0]
  const slots: FormationSlot[] = []

  formation.lines.forEach((line, lineIndex) => {
    const count = line.count
    for (let i = 0; i < count; i++) {
      // Tek eleman ortada; birden fazla elemanda eşit aralıklarla, kenarlara
      // taşmayacak şekilde (10-90 aralığı) dağıt.
      const x = count === 1 ? 50 : 12 + (i * (76 / (count - 1)))
      const position: PlayerPosition = line.role === "Goalkeeper"
        ? "GK"
        : line.role === "Defender"
          ? (count === 3 ? (i === 0 ? "LB" : i === count - 1 ? "RB" : "CB") : count >= 4 ? (i === 0 ? "LB" : i === count - 1 ? "RB" : "CB") : "CB")
          : line.role === "Midfielder"
            ? (line.y >= 50 ? "DM" : count >= 4 && i === 0 ? "LM" : count >= 4 && i === count - 1 ? "RM" : line.y <= 38 ? "AM" : "CM")
            : (count >= 3 && i === 0 ? "LW" : count >= 3 && i === count - 1 ? "RW" : count === 1 ? "ST" : "CF")
      slots.push({ key: `${line.role}-${lineIndex}-${i}`, role: line.role, position, x, y: line.y })
    }
  })

  return slots
}

/** Bir dizilişin, her rol için gereken saha oyuncusu sayısı. */
export function getFormationRoleCounts(formationId: string): Record<PlayerRole, number> {
  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0]
  const counts: Record<PlayerRole, number> = { Goalkeeper: 0, Defender: 0, Midfielder: 0, Attacker: 0 }
  formation.lines.forEach((line) => {
    counts[line.role] += line.count
  })
  return counts
}

export function isValidFormationId(id: string): boolean {
  return FORMATIONS.some((f) => f.id === id)
}
