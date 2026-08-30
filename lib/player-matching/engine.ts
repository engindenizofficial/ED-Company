import { normalizeDate, normalizeText } from './normalize'
import { nameSimilarity } from './similarity'

export type MatchPlayer = { id: string | number; name: string; birthDate: Date | string | null; teamName: string }
export type MatchLevel = 'exact_biographic' | 'fuzzy_name_birthdate' | 'unmatched'
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

type Prepared = MatchPlayer & { normalizedName: string; normalizedTeam: string; normalizedBirthDate: string | null }
const prepare = (player: MatchPlayer): Prepared => ({ ...player, normalizedName: normalizeText(player.name), normalizedTeam: normalizeText(player.teamName), normalizedBirthDate: normalizeDate(player.birthDate) })

function uniqueBest(source: Prepared, candidates: Prepared[], requireThreshold: boolean) {
  const ranked = candidates.map((candidate) => ({ candidate, score: nameSimilarity(source.normalizedName, candidate.normalizedName) })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || (requireThreshold && best.score <= 0.75)) return null
  if (ranked[1] && ranked[1].score === best.score) return null
  return best
}

export function matchPlayers(transfermarktPlayers: MatchPlayer[], apiFootballPlayers: MatchPlayer[]): MatchDecision[] {
  const api = apiFootballPlayers.map(prepare)
  const byBirthDate = new Map<string, Prepared[]>()
  for (const player of api) {
    if (!player.normalizedBirthDate) continue
    const players = byBirthDate.get(player.normalizedBirthDate) ?? []
    players.push(player)
    byBirthDate.set(player.normalizedBirthDate, players)
  }
  const usedApiIds = new Set<string>()
  const decisions: MatchDecision[] = []

  for (const rawPlayer of transfermarktPlayers) {
    const player = prepare(rawPlayer)
    const base = { transfermarktPlayer: rawPlayer, normalizedTransfermarktName: player.normalizedName, normalizedTeamName: player.normalizedTeam, birthDate: player.normalizedBirthDate }
    if (!player.normalizedBirthDate) {
      decisions.push({ ...base, apiFootballPlayer: null, level: 'unmatched', score: null, normalizedApiFootballName: null, reason: 'missing_birth_date' })
      continue
    }
    const available = (byBirthDate.get(player.normalizedBirthDate) ?? []).filter((candidate) => !usedApiIds.has(String(candidate.id)))
    const sameTeam = available.filter((candidate) => candidate.normalizedTeam === player.normalizedTeam)
    let selection = sameTeam.length === 1 ? { candidate: sameTeam[0], score: nameSimilarity(player.normalizedName, sameTeam[0].normalizedName) } : uniqueBest(player, sameTeam, false)
    let level: MatchLevel = 'exact_biographic'
    if (!selection) {
      selection = uniqueBest(player, available, true)
      level = 'fuzzy_name_birthdate'
    }
    if (!selection) {
      decisions.push({ ...base, apiFootballPlayer: null, level: 'unmatched', score: null, normalizedApiFootballName: null, reason: available.length ? 'ambiguous_or_low_score' : 'no_birth_date_candidate' })
      continue
    }
    usedApiIds.add(String(selection.candidate.id))
    decisions.push({ ...base, apiFootballPlayer: selection.candidate, level, score: selection.score, normalizedApiFootballName: selection.candidate.normalizedName })
  }
  return decisions
}
