import { toTurkishCountry } from "./tr-aliases"

/** Liglerin sabit kod eşlemesinde kullanılan alt güven sınırı. */
export const AUTO_MATCH_CONFIDENCE_THRESHOLD = 85
export const TEAM_AUTO_MATCH_THRESHOLD = 88
export const PLAYER_AUTO_MATCH_THRESHOLD = 92
export const MINIMUM_CANDIDATE_SCORE = 45
export const TEAM_MINIMUM_MARGIN = 8
export const PLAYER_MINIMUM_MARGIN = 10

const CLUB_NOISE = new Set([
  "fc", "cf", "sc", "sk", "ac", "as", "cd", "fk", "afc", "ssc", "sv", "vfb", "vfl", "club", "calcio",
  "football", "futbol", "fussball", "soccer", "kulubu", "kulubu", "spor", "deportivo", "athletic",
])
const PERSON_PARTICLES = new Set(["da", "de", "del", "di", "dos", "du", "la", "le", "van", "von"])
const TEAM_TOKEN_ALIASES: Record<string, string> = {
  munchen: "munich",
  muenchen: "munich",
  koln: "cologne",
  koeln: "cologne",
  milano: "milan",
  lisboa: "lisbon",
}

function fold(raw: string): string {
  return raw
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Genel isim normalizasyonu. Varlığa özel gürültü temizliği skorlama sırasında yapılır. */
export function normalizeName(raw: string): string {
  return fold(raw)
}

function tokens(raw: string): string[] {
  return normalizeName(raw).split(" ").filter(Boolean)
}

function bigrams(s: string): string[] {
  const clean = s.replace(/\s+/g, "")
  const result: string[] = []
  for (let i = 0; i < clean.length - 1; i++) result.push(clean.slice(i, i + 2))
  return result
}

function rawBigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100
  const ba = bigrams(a)
  const bb = bigrams(b)
  if (!ba.length || !bb.length) return 0
  const counts = new Map<string, number>()
  for (const item of bb) counts.set(item, (counts.get(item) ?? 0) + 1)
  let overlap = 0
  for (const item of ba) {
    const count = counts.get(item) ?? 0
    if (count > 0) {
      overlap++
      counts.set(item, count - 1)
    }
  }
  return Math.round((2 * overlap * 100) / (ba.length + bb.length))
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return Math.round((1 - previous[b.length] / Math.max(a.length, b.length)) * 100)
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const used = new Set<number>()
  let total = 0
  for (const left of a) {
    let best = 0
    let bestIndex = -1
    for (let index = 0; index < b.length; index++) {
      if (used.has(index)) continue
      const score = Math.max(rawBigramSimilarity(left, b[index]), levenshteinSimilarity(left, b[index]))
      if (score > best) {
        best = score
        bestIndex = index
      }
    }
    if (bestIndex >= 0 && best >= 55) used.add(bestIndex)
    total += best
  }
  const coverage = (2 * Math.min(a.length, b.length)) / (a.length + b.length)
  return Math.round((total / Math.max(a.length, b.length)) * coverage)
}

export function similarityScore(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  return Math.max(rawBigramSimilarity(na, nb), levenshteinSimilarity(na, nb), tokenSimilarity(tokens(a), tokens(b)))
}

/** Kulüp eklerini kaldırır; şehir/marka/kulüp kimliğini taşıyan kelimeleri korur. */
export function normalizeTeamName(raw: string): string {
  return tokens(raw)
    .filter((token) => !CLUB_NOISE.has(token))
    .map((token) => TEAM_TOKEN_ALIASES[token] ?? token)
    .join(" ")
}

export function teamSimilarityScore(a: string, b: string): number {
  const na = normalizeTeamName(a)
  const nb = normalizeTeamName(b)
  if (!na || !nb) return similarityScore(a, b)
  const direct = Math.max(rawBigramSimilarity(na, nb), levenshteinSimilarity(na, nb))
  const token = tokenSimilarity(na.split(" "), nb.split(" "))
  const containment = na.includes(nb) || nb.includes(na) ? Math.round(92 * Math.min(na.length, nb.length) / Math.max(na.length, nb.length) + 8) : 0
  return Math.min(100, Math.max(direct, token, containment))
}

function personTokens(raw: string): string[] {
  return tokens(raw).filter((token) => !PERSON_PARTICLES.has(token))
}

export function playerSimilarityScore(a: string, b: string): number {
  const left = personTokens(a)
  const right = personTokens(b)
  if (!left.length || !right.length) return 0
  const full = Math.max(tokenSimilarity(left, right), rawBigramSimilarity(left.join(" "), right.join(" ")))
  const surnameA = left[left.length - 1]
  const surnameB = right[right.length - 1]
  const surname = Math.max(rawBigramSimilarity(surnameA, surnameB), levenshteinSimilarity(surnameA, surnameB))
  if (surname < 72) return full

  const firstA = left[0]
  const firstB = right[0]
  const initialMatch = firstA[0] === firstB[0]
  const abbreviated = firstA.length <= 2 || firstB.length <= 2
  const first = abbreviated ? (initialMatch ? 100 : 0) : Math.max(rawBigramSimilarity(firstA, firstB), levenshteinSimilarity(firstA, firstB))
  const identity = Math.round(surname * 0.72 + first * 0.28)
  return Math.max(full, identity)
}

export function countrySimilarityScore(a: string, b: string): number {
  const na = normalizeName(toTurkishCountry(a))
  const nb = normalizeName(toTurkishCountry(b))
  if (na === nb) return 100
  return Math.max(rawBigramSimilarity(na, nb), levenshteinSimilarity(na, nb))
}

/** Ülkeyi isim kadar ağır basan eski ortalama yerine doğrulayıcı sinyal olarak kullanır. */
export function combinedMatchScore(nameScore: number, countryScore: number | null): number {
  if (countryScore === null) return Math.round(nameScore)
  if (countryScore >= 90) return Math.min(100, Math.round(nameScore * 0.9 + 10))
  if (countryScore < 45) return Math.max(0, Math.round(nameScore * 0.85 - 5))
  return Math.round(nameScore * 0.9 + countryScore * 0.1)
}

export interface LeagueMatchResult {
  nameMatchPercent: number
  countryMatchPercent: number | null
  matchPercent: number
  matchStatus: "matched" | "review"
}

export function matchLeague(apiName: string, apiCountry: string | null, tmName: string | null, tmCountry: string | null): LeagueMatchResult {
  const nameMatchPercent = tmName ? similarityScore(apiName, tmName) : 0
  const countryMatchPercent = apiCountry && tmCountry ? countrySimilarityScore(apiCountry, tmCountry) : null
  const matchPercent = combinedMatchScore(nameMatchPercent, countryMatchPercent)
  return { nameMatchPercent, countryMatchPercent, matchPercent, matchStatus: matchPercent >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? "matched" : "review" }
}

export interface StagedEntity {
  externalId: string
  name: string
  country: string | null
  valueEur: number | null
}

export interface EntityMatchResult {
  af: StagedEntity | null
  tm: StagedEntity | null
  nameMatchPercent: number
  countryMatchPercent: number | null
  confidence: number
  status: "matched" | "review" | "unmatched"
}

export interface EntityMatchOptions {
  nameScoreFn?: (a: string, b: string) => number
  autoThreshold?: number
  minimumMargin?: number
  minimumCandidateScore?: number
  /** Takımlarda farklı ülke güçlü bir çelişkidir; oyuncu uyruğunda değildir. */
  rejectCountryMismatch?: boolean
}

type Candidate = {
  af: StagedEntity
  tm: StagedEntity
  nameScore: number
  countryScore: number | null
  score: number
}

/**
 * Önce her iki yöndeki en iyi adayı bulur. Sadece karşılıklı en iyi, eşik üstü,
 * rakibinden açıkça ayrılan ve bağlamla çelişmeyen çiftler otomatik eşleşir.
 * Böylece zayıf bir çift doğru TM kaydını tüketemez; kararsız AF kaydı ise
 * admin kuyruğu için tek en iyi adayı taşır.
 */
export function matchStagedEntities(
  afEntities: StagedEntity[],
  tmEntities: StagedEntity[],
  optionsOrScoreFn: EntityMatchOptions | ((a: string, b: string) => number) = {},
): EntityMatchResult[] {
  const options: EntityMatchOptions = typeof optionsOrScoreFn === "function" ? { nameScoreFn: optionsOrScoreFn } : optionsOrScoreFn
  const nameScoreFn = options.nameScoreFn ?? teamSimilarityScore
  const threshold = options.autoThreshold ?? TEAM_AUTO_MATCH_THRESHOLD
  const margin = options.minimumMargin ?? TEAM_MINIMUM_MARGIN
  const minimumCandidate = options.minimumCandidateScore ?? MINIMUM_CANDIDATE_SCORE
  const candidates: Candidate[] = []

  for (const af of afEntities) {
    for (const tm of tmEntities) {
      const nameScore = nameScoreFn(af.name, tm.name)
      const countryScore = af.country && tm.country ? countrySimilarityScore(af.country, tm.country) : null
      const countryConflict = options.rejectCountryMismatch && countryScore !== null && countryScore < 45
      const score = countryConflict ? Math.min(69, combinedMatchScore(nameScore, countryScore)) : combinedMatchScore(nameScore, countryScore)
      candidates.push({ af, tm, nameScore, countryScore, score })
    }
  }

  const byAf = new Map<string, Candidate[]>()
  const byTm = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const afList = byAf.get(candidate.af.externalId) ?? []
    afList.push(candidate)
    byAf.set(candidate.af.externalId, afList)
    const tmList = byTm.get(candidate.tm.externalId) ?? []
    tmList.push(candidate)
    byTm.set(candidate.tm.externalId, tmList)
  }
  for (const list of [...byAf.values(), ...byTm.values()]) list.sort((a, b) => b.score - a.score || b.nameScore - a.nameScore)

  const autoMatches = new Map<string, Candidate>()
  const usedTm = new Set<string>()
  for (const af of afEntities) {
    const ranked = byAf.get(af.externalId) ?? []
    const best = ranked[0]
    if (!best || best.score < threshold) continue
    const afMargin = best.score - (ranked[1]?.score ?? 0)
    const tmRanked = byTm.get(best.tm.externalId) ?? []
    const reciprocal = tmRanked[0]?.af.externalId === af.externalId
    const tmMargin = best.score - (tmRanked[1]?.score ?? 0)
    const countryConflict = options.rejectCountryMismatch && best.countryScore !== null && best.countryScore < 45
    if (reciprocal && afMargin >= margin && tmMargin >= margin && !countryConflict) {
      autoMatches.set(af.externalId, best)
      usedTm.add(best.tm.externalId)
    }
  }

  return afEntities.map((af) => {
    const matched = autoMatches.get(af.externalId)
    if (matched) return { af, tm: matched.tm, nameMatchPercent: matched.nameScore, countryMatchPercent: matched.countryScore, confidence: matched.score, status: "matched" }

    const reviewCandidate = (byAf.get(af.externalId) ?? []).find((candidate) => !usedTm.has(candidate.tm.externalId) && candidate.score >= minimumCandidate)
    if (!reviewCandidate) return { af, tm: null, nameMatchPercent: 0, countryMatchPercent: null, confidence: 0, status: "unmatched" }
    return { af, tm: reviewCandidate.tm, nameMatchPercent: reviewCandidate.nameScore, countryMatchPercent: reviewCandidate.countryScore, confidence: reviewCandidate.score, status: "review" }
  })
}

export function matchTeams(afTeams: StagedEntity[], tmTeams: StagedEntity[]): EntityMatchResult[] {
  return matchStagedEntities(afTeams, tmTeams, {
    nameScoreFn: teamSimilarityScore,
    autoThreshold: TEAM_AUTO_MATCH_THRESHOLD,
    minimumMargin: TEAM_MINIMUM_MARGIN,
    rejectCountryMismatch: true,
  })
}

export function matchPlayers(afPlayers: StagedEntity[], tmPlayers: StagedEntity[]): EntityMatchResult[] {
  return matchStagedEntities(afPlayers, tmPlayers, {
    nameScoreFn: playerSimilarityScore,
    autoThreshold: PLAYER_AUTO_MATCH_THRESHOLD,
    minimumMargin: PLAYER_MINIMUM_MARGIN,
    rejectCountryMismatch: false,
  })
}
