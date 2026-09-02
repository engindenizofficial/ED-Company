import { normalizeDate, normalizeText } from './normalize'
import { analyzeNameEvidence } from './similarity'

export type MatchPlayer = { id: string | number; name: string; birthDate: Date | string | null; teamName: string }
type MatchLevel = 'exact_biographic' | 'fuzzy_name_birthdate' | 'unmatched'
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

type CandidateEdge = {
  transfermarktIndex: number
  apiFootballIndex: number
  rank: number
  score: number
}

function compareEdges(left: CandidateEdge, right: CandidateEdge) {
  return right.rank - left.rank || right.score - left.score
}

export function matchPlayers(transfermarktPlayers: MatchPlayer[], apiFootballPlayers: MatchPlayer[]): MatchDecision[] {
  const preparedTransfermarkt = transfermarktPlayers.map(prepare)
  const preparedApiFootball = apiFootballPlayers.map(prepare)
  const apiByBirthDate = new Map<string, number[]>()

  preparedApiFootball.forEach((player, index) => {
    if (!player.normalizedBirthDate) return
    const candidates = apiByBirthDate.get(player.normalizedBirthDate) ?? []
    candidates.push(index)
    apiByBirthDate.set(player.normalizedBirthDate, candidates)
  })

  const edges: CandidateEdge[] = []
  preparedTransfermarkt.forEach((player, transfermarktIndex) => {
    if (!player.normalizedBirthDate) return
    for (const apiFootballIndex of apiByBirthDate.get(player.normalizedBirthDate) ?? []) {
      const evidence = analyzeNameEvidence(player.normalizedName, preparedApiFootball[apiFootballIndex].normalizedName)
      if (evidence.accepted) edges.push({ transfermarktIndex, apiFootballIndex, rank: evidence.rank, score: evidence.score })
    }
  })

  const unambiguousEdges = edges.filter((edge) => {
    const transfermarktAlternatives = edges.filter(
      (candidate) => candidate.transfermarktIndex === edge.transfermarktIndex && candidate.apiFootballIndex !== edge.apiFootballIndex,
    )
    const apiFootballAlternatives = edges.filter(
      (candidate) => candidate.apiFootballIndex === edge.apiFootballIndex && candidate.transfermarktIndex !== edge.transfermarktIndex,
    )
    const equallyStrong = (candidate: CandidateEdge) => candidate.rank === edge.rank && candidate.score === edge.score
    return !transfermarktAlternatives.some(equallyStrong) && !apiFootballAlternatives.some(equallyStrong)
  })

  const selectedByTransfermarkt = new Map<number, CandidateEdge>()
  const usedApiFootball = new Set<number>()
  for (const edge of unambiguousEdges.sort(compareEdges)) {
    if (selectedByTransfermarkt.has(edge.transfermarktIndex) || usedApiFootball.has(edge.apiFootballIndex)) continue
    selectedByTransfermarkt.set(edge.transfermarktIndex, edge)
    usedApiFootball.add(edge.apiFootballIndex)
  }

  return transfermarktPlayers.map((rawPlayer, transfermarktIndex): MatchDecision => {
    const player = preparedTransfermarkt[transfermarktIndex]
    const base = {
      transfermarktPlayer: rawPlayer,
      normalizedTransfermarktName: player.normalizedName,
      normalizedTeamName: player.normalizedTeam,
      birthDate: player.normalizedBirthDate,
    }
    const selected = selectedByTransfermarkt.get(transfermarktIndex)

    if (!selected) {
      const sameDateCandidates = player.normalizedBirthDate ? apiByBirthDate.get(player.normalizedBirthDate) ?? [] : []
      return {
        ...base,
        apiFootballPlayer: null,
        level: 'unmatched',
        score: null,
        normalizedApiFootballName: null,
        reason: !player.normalizedBirthDate
          ? 'missing_birth_date'
          : sameDateCandidates.length
            ? edges.some((edge) => edge.transfermarktIndex === transfermarktIndex)
              ? 'ambiguous_name_match'
              : 'insufficient_name_evidence'
            : 'no_birth_date_candidate',
      }
    }

    const candidate = preparedApiFootball[selected.apiFootballIndex]
    return {
      ...base,
      apiFootballPlayer: candidate,
      level: player.normalizedName === candidate.normalizedName ? 'exact_biographic' : 'fuzzy_name_birthdate',
      score: selected.score,
      normalizedApiFootballName: candidate.normalizedName,
    }
  })
}
