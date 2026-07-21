import { buildPrediction } from "./prediction"
import type { AnalysisResult, Fixture, FormGame, LeagueInfo, TeamForm, TeamInfo } from "./types"

// Deterministic backup dataset. Used when API-Football is unreachable or the
// API key is invalid, so the interface and analyses keep working smoothly.

function team(id: number, name: string): TeamInfo {
  return { id, name, logo: `https://media.api-sports.io/football/teams/${id}.png` }
}

const LEAGUES: Record<string, LeagueInfo> = {
  pl: { id: 39, name: "Premier League", country: "England", logo: "https://media.api-sports.io/football/leagues/39.png", season: 2024, round: "Regular Season" },
  laliga: { id: 140, name: "La Liga", country: "Spain", logo: "https://media.api-sports.io/football/leagues/140.png", season: 2024, round: "Regular Season" },
  seriea: { id: 135, name: "Serie A", country: "Italy", logo: "https://media.api-sports.io/football/leagues/135.png", season: 2024, round: "Regular Season" },
  superlig: { id: 203, name: "Süper Lig", country: "Turkey", logo: "https://media.api-sports.io/football/leagues/203.png", season: 2024, round: "Regular Season" },
  ucl: { id: 2, name: "UEFA Champions League", country: "World", logo: "https://media.api-sports.io/football/leagues/2.png", season: 2024, round: "Group Stage" },
}

interface MockMatch {
  id: number
  league: LeagueInfo
  home: TeamInfo
  away: TeamInfo
  hour: number
  minute: number
}

const MOCK_MATCHES: MockMatch[] = [
  { id: 900101, league: LEAGUES.pl, home: team(50, "Manchester City"), away: team(40, "Liverpool"), hour: 18, minute: 30 },
  { id: 900102, league: LEAGUES.pl, home: team(42, "Arsenal"), away: team(49, "Chelsea"), hour: 16, minute: 0 },
  { id: 900103, league: LEAGUES.laliga, home: team(541, "Real Madrid"), away: team(529, "Barcelona"), hour: 22, minute: 0 },
  { id: 900104, league: LEAGUES.laliga, home: team(530, "Atletico Madrid"), away: team(536, "Sevilla"), hour: 20, minute: 0 },
  { id: 900105, league: LEAGUES.seriea, home: team(505, "Inter"), away: team(489, "AC Milan"), hour: 21, minute: 45 },
  { id: 900106, league: LEAGUES.seriea, home: team(496, "Juventus"), away: team(492, "Napoli"), hour: 19, minute: 0 },
  { id: 900107, league: LEAGUES.superlig, home: team(645, "Galatasaray"), away: team(549, "Fenerbahce"), hour: 19, minute: 0 },
  { id: 900108, league: LEAGUES.superlig, home: team(564, "Besiktas"), away: team(998, "Trabzonspor"), hour: 16, minute: 30 },
  { id: 900109, league: LEAGUES.ucl, home: team(157, "Bayern Munich"), away: team(85, "Paris Saint Germain"), hour: 22, minute: 0 },
  { id: 900110, league: LEAGUES.ucl, home: team(165, "Borussia Dortmund"), away: team(496, "Juventus"), hour: 22, minute: 0 },
]

export function getMockFixtures(date: string): Fixture[] {
  return MOCK_MATCHES.map((m) => {
    const dt = new Date(`${date}T${String(m.hour).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}:00+03:00`)
    return {
      id: m.id,
      date: dt.toISOString(),
      timestamp: Math.floor(dt.getTime() / 1000),
      status: "Not Started",
      statusShort: "NS",
      venue: `${m.home.name} Stadium`,
      league: m.league,
      home: m.home,
      away: m.away,
      goalsHome: null,
      goalsAway: null,
    }
  })
}

export function getMockFixtureById(id: number): Fixture | null {
  const fixtures = getMockFixtures(new Date().toISOString().slice(0, 10))
  return fixtures.find((f) => f.id === id) ?? null
}

// Seeded pseudo-random so a given team always produces the same believable form.
function seeded(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const OPPONENTS = ["Rakip FK", "United", "City", "Athletic", "Sporting", "Rovers", "Wanderers", "Olympic"]

function buildMockForm(t: TeamInfo, homeVenueBias: boolean): TeamForm {
  const rand = seeded(t.id)
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

  const strength = 0.9 + rand() * 0.9 // 0.9 - 1.8 attack tendency

  for (let i = 0; i < 10; i++) {
    const isHome = i % 2 === (homeVenueBias ? 0 : 1)
    const scored = Math.max(0, Math.round((rand() * 2.4 + strength - 0.6) * (isHome ? 1.1 : 0.9)))
    const conceded = Math.max(0, Math.round(rand() * 2.2))
    const opponent = OPPONENTS[Math.floor(rand() * OPPONENTS.length)]

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
    team: t,
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

function buildMockH2H(home: TeamInfo, away: TeamInfo): FormGame[] {
  const rand = seeded(home.id + away.id)
  const games: FormGame[] = []
  for (let i = 0; i < 5; i++) {
    const scored = Math.round(rand() * 3)
    const conceded = Math.round(rand() * 3)
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({ opponent: away.name, scored, conceded, result, home: true })
  }
  return games
}

export function getMockAnalysis(fixture: Fixture): AnalysisResult {
  const homeForm = buildMockForm(fixture.home, true)
  const awayForm = buildMockForm(fixture.away, false)
  const h2h = buildMockH2H(fixture.home, fixture.away)
  const prediction = buildPrediction(homeForm, awayForm, h2h)
  return { fixture, homeForm, awayForm, h2h, prediction, source: "mock" }
}
