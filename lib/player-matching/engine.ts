import { normalizeDate, normalizeText } from './normalize'
import { uniqueBestNameMatch } from './similarity'

export type MatchPlayer = { id: string | number; name: string; birthDate: Date | string | null; teamName: string }
export type MatchLevel = 'matched' | 'unmatched'
export type MatchDecision = {
  transfermarktPlayer: MatchPlayer
  apiFootballPlayer: MatchPlayer | null
  level: MatchLevel
  score: number | null
  normalizedTransfermarktName: string
  normalizedApiFootballName: string | null
  normalizedTeamName: string
  birthDate: string | null
  reason?: string
}

type Prepared = MatchPlayer & {
  normalizedName: string
  normalizedTeam: string
  normalizedBirthDate: string | null
}

const prepare = (player: MatchPlayer): Prepared => ({
  ...player,
  normalizedName: normalizeText(player.name),
  normalizedTeam: normalizeText(player.teamName),
  normalizedBirthDate: normalizeDate(player.birthDate),
})

export function matchPlayers(transfermarktPlayers: MatchPlayer[], apiFootballPlayers: MatchPlayer[]): MatchDecision[] {
  const byBirthDate = new Map<string, Prepared[]>()

  for (const player of apiFootballPlayers.map(prepare)) {
    if (!player.normalizedBirthDate) continue
    const candidates = byBirthDate.get(player.normalizedBirthDate) ?? []
    candidates.push(player)
    byBirthDate.set(player.normalizedBirthDate, candidates)
  }

  const usedApiIds = new Set<string>()

  return transfermarktPlayers.map((rawPlayer): MatchDecision => {
    const player = prepare(rawPlayer)
    const base = {
      transfermarktPlayer: rawPlayer,
      normalizedTransfermarktName: player.normalizedName,
      normalizedTeamName: player.normalizedTeam,
      birthDate: player.normalizedBirthDate,
    }

    if (!player.normalizedBirthDate) {
      return { ...base, apiFootballPlayer: null, level: 'unmatched', score: null, normalizedApiFootballName: null, reason: 'missing_birth_date' }
    }

    const available = (byBirthDate.get(player.normalizedBirthDate) ?? []).filter(
      (candidate) => !usedApiIds.has(String(candidate.id)),
    )
    const selection = uniqueBestNameMatch(player.normalizedName, available, (candidate) => candidate.normalizedName)

    if (!selection) {
      return {
        ...base,
        apiFootballPlayer: null,
        level: 'unmatched',
        score: null,
        normalizedApiFootballName: null,
        reason: available.length ? 'tied_best_name_score' : 'no_birth_date_candidate',
      }
    }

    usedApiIds.add(String(selection.candidate.id))
    return {
      ...base,
      apiFootballPlayer: selection.candidate,
      level: 'matched',
      score: selection.score,
      normalizedApiFootballName: selection.candidate.normalizedName,
    }
  })
}
