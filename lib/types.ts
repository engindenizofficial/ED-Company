// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface TeamInfo {
  id: number
  name: string
  logo: string
}

export interface LeagueInfo {
  id: number
  name: string
  country: string
  logo: string
  season: number
  round?: string
}

export interface Fixture {
  id: number
  date: string
  timestamp: number
  status: string
  statusShort: string
  // Live elapsed minute (only present while the match is being played).
  elapsed: number | null
  venue: string | null
  league: LeagueInfo
  home: TeamInfo
  away: TeamInfo
  goalsHome: number | null
  goalsAway: number | null
}

/** A fixture as sent to the client list. */
export type FixtureWithPrediction = Fixture

// ---------------------------------------------------------------------------
// Live / raw API-Football data (refreshable)
// ---------------------------------------------------------------------------

export interface MatchEvent {
  minute: number
  extra: number | null
  team: string
  player: string | null
  assist: string | null
  type: string
  detail: string
}

export interface StatItem {
  type: string
  home: string | number | null
  away: string | number | null
}

export interface LineupPlayer {
  id: number | null
  number: number | null
  name: string
  pos: string | null
  grid: string | null
}

export interface TeamLineup {
  team: string
  formation: string | null
  coach: string | null
  startXI: LineupPlayer[]
  substitutes: LineupPlayer[]
}

export interface StandingRow {
  rank: number
  team: string
  teamId: number
  points: number
  played: number
  win: number
  draw: number
  lose: number
  goalsFor: number
  goalsAgainst: number
  form: string | null
  group: string
}

export interface InjuryItem {
  team: string
  player: string
  reason: string
  type: string
}

export interface FormGame {
  opponent: string
  scored: number
  conceded: number
  result: "W" | "D" | "L"
  home: boolean
  date: string
}

export interface TeamSeasonStats {
  team: TeamInfo
  formString: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsForAvg: number
  goalsAgainstAvg: number
  cleanSheets: number
  failedToScore: number
  recent: FormGame[]
}

/** Everything we pulled live from API-Football for the detail panel. */
export interface LiveMatchData {
  fixture: Fixture
  events: MatchEvent[]
  statistics: StatItem[]
  lineups: TeamLineup[]
  standings: StandingRow[]
  injuries: InjuryItem[]
  h2h: FormGame[]
  homeStats: TeamSeasonStats | null
  awayStats: TeamSeasonStats | null
}

// ---------------------------------------------------------------------------
// Player data
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  id: number
  name: string
  firstname: string
  lastname: string
  age: number | null
  nationality: string | null
  height: string | null
  weight: string | null
  photo: string | null
  position: string | null
  number: number | null
  injured: boolean
  /** Current team */
  team: TeamInfo | null
  /** Current league */
  league: { id: number; name: string; country: string; logo: string; season: number } | null
}

export interface PlayerSeasonStats {
  season: number
  team: TeamInfo
  league: { id: number; name: string; country: string; logo: string }
  appearances: number | null
  lineups: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  rating: string | null
  shotsTotal: number | null
  shotsOn: number | null
  passesTotal: number | null
  passesAccuracy: string | null
  tacklesTotal: number | null
  dribblesAttempted: number | null
  dribblesSuccess: number | null
}

export interface Transfer {
  date: string | null
  type: string
  teamFrom: TeamInfo
  teamTo: TeamInfo
}

export interface Trophy {
  league: string
  country: string
  season: string
  place: string
}

export interface TopScorer {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  goals: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  appearances: number | null
  rating: string | null
}

export interface FixturePlayerStat {
  team: string
  teamId: number
  player: { id: number; name: string; photo: string | null; number: number | null; pos: string | null }
  rating: string | null
  minutes: number | null
  goals: number | null
  assists: number | null
  yellowCard: boolean
  redCard: boolean
  shots: number | null
  shotsOn: number | null
  passes: number | null
  passesAccuracy: string | null
  tackles: number | null
  dribbles: number | null
  captain: boolean
  substitute: boolean
}

export interface PlayerPageData {
  profile: PlayerProfile
  stats: PlayerSeasonStats[]
  transfers: Transfer[]
  trophies: Trophy[]
  cachedAt: number
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface FixturesResponse {
  date: string
  fixtures: Fixture[]
  cachedAt: number
  stale?: boolean
}

export interface AnalysisResponse {
  live: LiveMatchData
  playerStats: FixturePlayerStat[]
  liveCachedAt: number
  stale?: boolean
}

export interface LeaguePageData {
  league: { id: number; name: string; country: string; logo: string; season: number }
  standings: StandingRow[]
  topScorers: TopScorer[]
  fixtures: Fixture[]
  cachedAt: number
}

export interface SquadPlayer {
  id: number
  name: string
  age: number | null
  number: number | null
  pos: string | null
  photo: string | null
}

export interface TeamTransfer {
  date: string | null
  type: string
  teamFrom: TeamInfo
  teamTo: TeamInfo
  player: { id: number; name: string; photo: string | null }
}

export interface TeamTrophy {
  league: string
  country: string
  season: string
  place: string
}

export interface TeamCoach {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  career: { team: TeamInfo; start: string | null; end: string | null }[]
}

export interface TeamTopScorer {
  player: { id: number; name: string; photo: string | null }
  goals: number
  assists: number
  appearances: number
  rating: string | null
  yellowCards: number
  redCards: number
  pos: string | null
}

export interface TeamPageData {
  team: TeamInfo
  venue: { name: string | null; city: string | null; capacity: number | null; image: string | null }
  currentSeason: number
  stats: TeamSeasonStats | null
  squad: SquadPlayer[]
  recentFixtures: Fixture[]
  standings: StandingRow[]
  transfers: TeamTransfer[]
  trophies: TeamTrophy[]
  coach: TeamCoach | null
  topScorers: TeamTopScorer[]
  fetchedAt: number
}
