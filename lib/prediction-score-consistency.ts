export type MatchWinner = "home" | "away" | "draw"

export type WeightedScore = {
  homeScore: number
  awayScore: number
  weight: number
}

export function winnerFromScore(homeScore: number, awayScore: number): MatchWinner {
  if (homeScore > awayScore) return "home"
  if (awayScore > homeScore) return "away"
  return "draw"
}

/**
 * Bir skoru seçilmiş maç sonucuna en küçük toplam gol değişikliğiyle uyarlar.
 * Beraberlikte düşük skoru yükseltmek, galibiyetlerde ise yalnızca gerekli
 * olduğunda kazanan tarafı rakibin bir gol üzerine taşımak skoru negatif yapmaz.
 */
export function alignScoreWithWinner(
  homeScore: number,
  awayScore: number,
  winner: MatchWinner,
): { homeScore: number; awayScore: number } {
  if (winner === "draw") {
    const levelScore = Math.max(homeScore, awayScore)
    return { homeScore: levelScore, awayScore: levelScore }
  }

  if (winner === "home" && homeScore <= awayScore) {
    return { homeScore: awayScore + 1, awayScore }
  }

  if (winner === "away" && awayScore <= homeScore) {
    return { homeScore, awayScore: homeScore + 1 }
  }

  return { homeScore, awayScore }
}

export function selectConsistentScore(
  scores: WeightedScore[],
  winner: MatchWinner,
): { homeScore: number; awayScore: number } {
  if (scores.length === 0) return alignScoreWithWinner(0, 0, winner)

  const compatibleScores = scores.filter(
    (score) => winnerFromScore(score.homeScore, score.awayScore) === winner,
  )
  const candidates = compatibleScores.length > 0 ? compatibleScores : scores

  const scoreTally = new Map<string, WeightedScore>()
  for (const score of candidates) {
    const key = `${score.homeScore}-${score.awayScore}`
    const entry = scoreTally.get(key)
    if (entry) entry.weight += score.weight
    else scoreTally.set(key, { ...score })
  }

  const rankedScores = [...scoreTally.values()].sort((a, b) => b.weight - a.weight)
  const topScore = rankedScores[0]
  const hasPlurality = rankedScores.length === 1 || topScore.weight > rankedScores[1].weight

  if (hasPlurality) {
    return alignScoreWithWinner(topScore.homeScore, topScore.awayScore, winner)
  }

  const totalWeight = candidates.reduce((sum, score) => sum + score.weight, 0)
  const homeScore = Math.round(
    candidates.reduce((sum, score) => sum + score.homeScore * score.weight, 0) / totalWeight,
  )
  const awayScore = Math.round(
    candidates.reduce((sum, score) => sum + score.awayScore * score.weight, 0) / totalWeight,
  )

  return alignScoreWithWinner(homeScore, awayScore, winner)
}
