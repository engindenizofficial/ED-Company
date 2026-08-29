export type CsvPlayer = {
  csvPlayerId: string
  name: string
  dateOfBirth: string
  citizenship: string | null
  subPosition: string | null
  marketValueEur: number | null
}

export type ApiPlayerCandidate = {
  playerId: number
  name: string
  firstName: string | null
  lastName: string | null
  dateOfBirth: string
  nationality: string | null
  teamId: number
  teamName: string
  teamCountry: string | null
  leagueId: number
  leagueName: string
  leagueCountry: string | null
}

export type MatchResult =
  | { status: "matched"; csv: CsvPlayer; candidate: ApiPlayerCandidate }
  | { status: "unmatched"; csv: CsvPlayer; reason: string }
  | { status: "ambiguous"; csv: CsvPlayer; candidates: ApiPlayerCandidate[] }

export function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === "," && !quoted) {
      values.push(value)
      value = ""
    } else {
      value += char
    }
  }
  values.push(value)
  return values
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’'`.-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeDate(value: string): string {
  return value.trim().slice(0, 10)
}

function nameScore(csvName: string, candidate: ApiPlayerCandidate): number {
  const csv = normalizeName(csvName)
  const names = [candidate.name, [candidate.firstName, candidate.lastName].filter(Boolean).join(" ")]
    .map(normalizeName)
    .filter(Boolean)
  if (names.includes(csv)) return 3

  const csvTokens = csv.split(" ")
  for (const name of names) {
    const tokens = name.split(" ")
    if (csvTokens.length >= 2 && tokens.length >= 2 && csvTokens[0] === tokens[0] && csvTokens.at(-1) === tokens.at(-1)) return 2
    const short = csvTokens.length < tokens.length ? csvTokens : tokens
    const long = short === csvTokens ? tokens : csvTokens
    if (short.length >= 2 && short.every((token) => long.includes(token))) return 1
  }
  return 0
}

export function matchPlayer(csv: CsvPlayer, candidates: ApiPlayerCandidate[]): MatchResult {
  const bornSameDay = candidates.filter((candidate) => normalizeDate(candidate.dateOfBirth) === normalizeDate(csv.dateOfBirth))
  const scored = bornSameDay
    .map((candidate) => {
      const score = nameScore(csv.name, candidate)
      const nationalityMatch = Boolean(
        csv.citizenship && candidate.nationality && normalizeName(csv.citizenship) === normalizeName(candidate.nationality),
      )
      return { candidate, score: score * 10 + (nationalityMatch ? 1 : 0) }
    })
    .filter(({ score }) => score >= 10)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return { status: "unmatched", csv, reason: bornSameDay.length ? "name-conflict" : "birth-date-not-found" }
  const bestScore = scored[0].score
  const best = scored.filter(({ score }) => score === bestScore).map(({ candidate }) => candidate)
  if (best.length !== 1) return { status: "ambiguous", csv, candidates: best }
  return { status: "matched", csv, candidate: best[0] }
}

export function parsePlayerCsv(contents: string): CsvPlayer[] {
  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) throw new Error("CSV boş veya başlık satırı eksik.")
  const headers = parseCsvLine(lines[0])
  const required = ["player_id", "name", "date_of_birth", "country_of_citizenship", "sub_position", "market_value_in_eur"]
  for (const column of required) if (!headers.includes(column)) throw new Error(`CSV zorunlu sütunu eksik: ${column}`)
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]))

  return lines.slice(1).map((line, rowIndex) => {
    const row = parseCsvLine(line)
    const rawValue = row[index.market_value_in_eur]?.trim()
    const marketValueEur = rawValue && /^\d+$/.test(rawValue) && Number(rawValue) >= 0 ? Number(rawValue) : null
    const name = row[index.name]?.trim()
    const dateOfBirth = normalizeDate(row[index.date_of_birth] ?? "")
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new Error(`CSV satırı geçersiz: ${rowIndex + 2}`)
    return {
      csvPlayerId: row[index.player_id]?.trim() ?? "",
      name,
      dateOfBirth,
      citizenship: row[index.country_of_citizenship]?.trim() || null,
      subPosition: row[index.sub_position]?.trim() || null,
      marketValueEur,
    }
  })
}
