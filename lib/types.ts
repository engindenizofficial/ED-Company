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

export interface FormGame {
  opponent: string
  scored: number
  conceded: number
  result: "W" | "D" | "L"
  home: boolean
}

export interface TeamForm {
  team: TeamInfo
  games: FormGame[]
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  avgScored: number
  avgConceded: number
  homeAvgScored: number
  homeAvgConceded: number
  awayAvgScored: number
  awayAvgConceded: number
  formString: string
  points: number
}

export interface ScoreProbability {
  home: number
  away: number
  probability: number
}

export interface Prediction {
  expectedGoalsHome: number
  expectedGoalsAway: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
  mostLikelyScore: { home: number; away: number }
  topScores: ScoreProbability[]
  over25Pct: number
  bttsPct: number
  confidence: number
  verdict: "home" | "draw" | "away"
  report: string[]
}

export interface AnalysisResult {
  fixture: Fixture
  homeForm: TeamForm
  awayForm: TeamForm
  h2h: FormGame[]
  prediction: Prediction
  source?: "live"
  // Set when the API was rate limited/down and this is the last real data.
  stale?: boolean
  cachedAt?: number
}

export interface FixturesResponse {
  date: string
  fixtures: Fixture[]
  source: "live"
  // Set when the API was rate limited/down and this is the last real data.
  stale?: boolean
  cachedAt?: number
}
