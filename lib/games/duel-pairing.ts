import type { DuelDifficulty } from "./market-value-duel"

export interface DuelPairCandidate {
  playerId: number
  valueEur: number
}

export function relativeValueGap(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(a, b)
}

function gapFitsDifficulty(gap: number, difficulty: DuelDifficulty, tolerance = 0): boolean {
  if (difficulty === "easy") return gap >= Math.max(0.45 - tolerance, 0.2)
  if (difficulty === "normal") return gap >= Math.max(0.18 - tolerance, 0.05) && gap <= 0.5 + tolerance
  return gap > 0 && gap <= 0.18 + tolerance
}

export function selectDuelPair<T extends DuelPairCandidate>(candidates: T[], difficulty: DuelDifficulty): [T, T] | null {
  const unique = Array.from(new Map(candidates.map((candidate) => [candidate.playerId, candidate])).values())
  for (const tolerance of [0, 0.08, 0.18, 0.35, 1]) {
    const pairs: [T, T][] = []
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        if (unique[i].valueEur === unique[j].valueEur) continue
        if (gapFitsDifficulty(relativeValueGap(unique[i].valueEur, unique[j].valueEur), difficulty, tolerance)) pairs.push([unique[i], unique[j]])
      }
    }
    if (pairs.length > 0) return pairs[Math.floor(Math.random() * pairs.length)]
  }
  return null
}
