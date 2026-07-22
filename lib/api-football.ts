import type { Fixture, FormGame, TeamForm, TeamInfo } from "./types"

const BASE_URL = "https://v3.football.api-sports.io"

// Popular leagues to surface first (API-Football league IDs)
export const FEATURED_LEAGUES = [
  39, // Premier League
  140, // La Liga
  135, // Serie A
  78, // Bundesliga
  61, // Ligue 1
  203, // Süper Lig
  2, // Champions League
  3, // Europa League
  88, // Eredivisie
  94, // Primeira Liga
]

class ApiFootballError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new ApiFootballError("API_FOOTBALL_KEY tanımlı değil.", 500)
  }

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    search.set(k, String(v))
  }

  const res = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    headers: { "x-apisports-key": key },
    // Cache fixtures briefly to stay within rate limits
    next: { revalidate: 120 },
  })

  if (!res.ok) {
    throw new ApiFootballError(`API-Football isteği başarısız (${res.status})`, res.status)
  }

  const json = await res.json()
  if (json.errors && Object.keys(json.errors).length > 0) {
    const msg = Object.values(json.errors).join(" ")
    throw new ApiFootballError(String(msg || "API-Football hatası"), 502)
  }
  return (json.response as T[]) ?? []
}

interface RawFixture {
  fixture: {
    id: number
    date: string
    timestamp: number
    status: { long: string; short: string; elapsed: number | null }
    venue: { name: string | null }
  }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

function mapFixture(r: RawFixture): Fixture {
  return {
    id: r.fixture.id,
    date: r.fixture.date,
    timestamp: r.fixture.timestamp,
    status: r.fixture.status.long,
    statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null,
    venue: r.fixture.venue?.name ?? null,
    league: {
      id: r.league.id,
      name: r.league.name,
      country: r.league.country,
      logo: r.league.logo,
      season: r.league.season,
      round: r.league.round,
    },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home,
    goalsAway: r.goals.away,
  }
}

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  const raw = await apiFetch<RawFixture>("/fixtures", { date, timezone: "Europe/Istanbul" })
  const fixtures = raw.map(mapFixture)

  // Sort featured leagues first, then by kickoff time
  fixtures.sort((a, b) => {
    const ai = FEATURED_LEAGUES.indexOf(a.league.id)
    const bi = FEATURED_LEAGUES.indexOf(b.league.id)
    const aRank = ai === -1 ? 999 : ai
    const bRank = bi === -1 ? 999 : bi
    if (aRank !== bRank) return aRank - bRank
    return a.timestamp - b.timestamp
  })

  return fixtures
}

export async function getFixtureById(id: number): Promise<Fixture | null> {
  const raw = await apiFetch<RawFixture>("/fixtures", { id })
  if (raw.length === 0) return null
  return mapFixture(raw[0])
}

function buildForm(team: TeamInfo, raw: RawFixture[]): TeamForm {
  const games: FormGame[] = []
  let wins = 0
  let draws = 0
  let losses = 0
  let goalsFor = 0
  let goalsAgainst = 0
  let homeScored = 0
  let homeConceded = 0
  let homeGames = 0
  let awayScored = 0
  let awayConceded = 0
  let awayGames = 0

  // API returns most recent first; keep only finished games
  for (const r of raw) {
    if (!r.fixture.status.short.match(/FT|AET|PEN/)) continue
    const isHome = r.teams.home.id === team.id
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name

    let result: "W" | "D" | "L"
    if (scored > conceded) {
      result = "W"
      wins++
    } else if (scored === conceded) {
      result = "D"
      draws++
    } else {
      result = "L"
      losses++
    }

    goalsFor += scored
    goalsAgainst += conceded
    if (isHome) {
      homeScored += scored
      homeConceded += conceded
      homeGames++
    } else {
      awayScored += scored
      awayConceded += conceded
      awayGames++
    }

    games.push({ opponent, scored, conceded, result, home: isHome })
  }

  const played = games.length || 1
  return {
    team,
    games,
    played: games.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    avgScored: goalsFor / played,
    avgConceded: goalsAgainst / played,
    homeAvgScored: homeGames ? homeScored / homeGames : goalsFor / played,
    homeAvgConceded: homeGames ? homeConceded / homeGames : goalsAgainst / played,
    awayAvgScored: awayGames ? awayScored / awayGames : goalsFor / played,
    awayAvgConceded: awayGames ? awayConceded / awayGames : goalsAgainst / played,
    formString: games
      .slice(0, 5)
      .map((g) => g.result)
      .reverse()
      .join(""),
    points: wins * 3 + draws,
  }
}

// Free API-Football plans block the `last` parameter and only expose seasons
// 2022-2024, so we fetch by team+season and derive recent form ourselves,
// walking back through seasons until we have enough finished games.
const AVAILABLE_SEASONS = [2024, 2023, 2022]

export async function getTeamForm(team: TeamInfo, last = 10): Promise<TeamForm> {
  const collected: RawFixture[] = []

  for (const season of AVAILABLE_SEASONS) {
    let raw: RawFixture[] = []
    try {
      raw = await apiFetch<RawFixture>("/fixtures", { team: team.id, season })
    } catch {
      continue
    }
    const finished = raw.filter((r) => /FT|AET|PEN/.test(r.fixture.status.short))
    collected.push(...finished)
    if (collected.length >= last) break
  }

  // Most recent first, then keep only the requested window
  collected.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
  return buildForm(team, collected.slice(0, last))
}

export async function getHeadToHead(homeId: number, awayId: number, last = 6): Promise<FormGame[]> {
  let raw: RawFixture[] = []
  try {
    raw = await apiFetch<RawFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}` })
  } catch {
    return []
  }
  raw.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
  raw = raw.slice(0, last)
  const games: FormGame[] = []
  for (const r of raw) {
    if (!r.fixture.status.short.match(/FT|AET|PEN/)) continue
    const isHome = r.teams.home.id === homeId
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({ opponent, scored, conceded, result, home: isHome })
  }
  return games
}
