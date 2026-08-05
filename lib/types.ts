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
  // Uzatma süresi (örn. 90+3 → extra=3). Sadece uzatma döneminde dolu.
  elapsedExtra: number | null
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
  playerId: number | null
  assist: string | null
  assistId: number | null
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
  teamLogo: string
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
  playerId: number | null
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
  /** H2H için gerçek takım adları */
  homeTeam?: string
  awayTeam?: string
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
  yellowRedCards: number | null
  rating: string | null
  // Shots
  shotsTotal: number | null
  shotsOn: number | null
  // Passes
  passesTotal: number | null
  passesKey: number | null
  passesAccuracy: string | null
  // Tackles
  tacklesTotal: number | null
  interceptions: number | null
  blockedShots: number | null
  // Duels
  duelsTotal: number | null
  duelsWon: number | null
  // Dribbles
  dribblesAttempted: number | null
  dribblesSuccess: number | null
  // Fouls
  foulsDrawn: number | null
  foulsCommitted: number | null
  // Offsides
  offsides: number | null
  // Penalty
  penaltyWon: number | null
  penaltyScored: number | null
  penaltyMissed: number | null
  penaltySaved: number | null
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

export interface SidelinedEntry {
  type: string
  start: string | null
  end: string | null
}

export interface PlayerPageData {
  profile: PlayerProfile
  stats: PlayerSeasonStats[]
  transfers: Transfer[]
  trophies: Trophy[]
  sidelined: SidelinedEntry[]
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

export interface LeagueSeasonStats {
  /** Toplam maç sayısı */
  totalMatches: number
  /** Toplam gol */
  totalGoals: number
  /** Maç başı ortalama gol */
  avgGoalsPerMatch: number
  /** Toplam sarı kart */
  yellowCards: number
  /** Toplam kırmızı kart */
  redCards: number
}

export interface LeagueTopScorer {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  goals: number
  assists: number
  appearances: number
  rating: string | null
  yellowCards: number
  redCards: number
  pos: string | null
}

export interface LeagueTopAssist {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  assists: number
  goals: number
  appearances: number
  rating: string | null
}

export interface LeagueTopCard {
  player: { id: number; name: string; photo: string | null; nationality: string | null }
  team: TeamInfo
  yellow: number
  red: number
  appearances: number
}

export interface LeaguePageData {
  league: { id: number; name: string; country: string; logo: string; season: number; flagUrl: string | null }
  standings: StandingRow[]
  topScorers: LeagueTopScorer[]
  topAssists: LeagueTopAssist[]
  topYellowCards: LeagueTopCard[]
  topRedCards: LeagueTopCard[]
  recentFixtures: Fixture[]
  upcomingFixtures: Fixture[]
  seasonStats: LeagueSeasonStats | null
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
