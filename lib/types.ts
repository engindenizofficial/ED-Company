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

/** A fixture as sent to the client list: carries Gemini's locked score if any. */
export interface FixtureWithPrediction extends Fixture {
  // Locked Gemini score prediction (only present once generated & cached).
  predictedScore: { home: number; away: number } | null
  predictedWinner: "home" | "draw" | "away" | null
}

// ---------------------------------------------------------------------------
// Gemini prediction (generated ONCE, then locked forever)
// ---------------------------------------------------------------------------

export interface GeminiPrediction {
  // Headline score prediction.
  score: { home: number; away: number }
  halfTimeScore: { home: number; away: number }
  winner: "home" | "draw" | "away"

  // Outcome probabilities (percentages, sum ~100).
  homeWinPct: number
  drawPct: number
  awayWinPct: number

  // Goal markets (percentages).
  over25Pct: number
  under25Pct: number
  bttsPct: number

  // Extra market reads (free text, short).
  cornersEstimate: string
  cardsEstimate: string
  firstToScore: "home" | "away" | "none"

  // Expected goals.
  expectedGoalsHome: number
  expectedGoalsAway: number

  // Model confidence (0-100).
  confidence: number

  // Human-readable analysis from Gemini.
  keyFactors: string[]
  analysis: string[]

  // Metadata.
  model: string
  generatedAt: number
}

// ---------------------------------------------------------------------------
// Live / raw API-Football data (refreshable, NOT locked)
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
  // API-Football's own prediction advice (used as a Gemini input + shown raw).
  apiAdvice: string | null
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface FixturesResponse {
  date: string
  fixtures: FixtureWithPrediction[]
  cachedAt: number
  stale?: boolean
}

export interface AnalysisResponse {
  live: LiveMatchData
  prediction: GeminiPrediction
  liveCachedAt: number
  predictionLocked: boolean
  stale?: boolean
}
