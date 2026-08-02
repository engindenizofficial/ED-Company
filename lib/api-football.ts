import type {
  Fixture,
  FixturePlayerStat,
  FormGame,
  InjuryItem,
  LineupPlayer,
  LiveMatchData,
  MatchEvent,
  PlayerProfile,
  PlayerSeasonStats,
  StandingRow,
  StatItem,
  TeamInfo,
  TeamLineup,
  TeamSeasonStats,
  TopScorer,
  Transfer,
  Trophy,
} from "./types"
import { toTurkishCountry } from "./tr-aliases"

const BASE_URL = "https://v3.football.api-sports.io"

// ---------------------------------------------------------------------------
// League market-value ranking table
// Approx. transfermarkt total squad value tiers (higher = more valuable).
// Leagues not listed here fall back to score 0 (lowest priority).
// ---------------------------------------------------------------------------
export const LEAGUE_MARKET_VALUE: Record<number, number> = {
  // Tier 1 — Top 5 + UEFA club comps
  2: 9000,   // UEFA Champions League
  3: 5500,   // UEFA Europa League
  848: 3200, // UEFA Conference League
  39: 8500,  // Premier League (England)
  140: 7000, // La Liga (Spain)
  135: 6500, // Serie A (Italy)
  78: 6000,  // Bundesliga (Germany)
  61: 5000,  // Ligue 1 (France)

  // Tier 2 — Strong European leagues
  88: 2800,  // Eredivisie (Netherlands)
  94: 2600,  // Primeira Liga (Portugal)
  203: 2400, // Süper Lig (Turkey)
  144: 2200, // Jupiler Pro League (Belgium)
  179: 2000, // Scottish Premiership
  106: 1800, // Ekstraklasa (Poland)
  235: 1600, // Premier League (Russia)
  218: 1500, // Super League (Greece)
  207: 1400, // Super League (Switzerland)
  113: 1400, // Allsvenskan (Sweden)
  103: 1300, // Eliteserien (Norway)
  119: 1300, // Superliga (Denmark)
  345: 1200, // HNL (Croatia)
  332: 1100, // SuperLiga (Serbia)
  283: 1000, // Super Liga (Czech)
  108: 1000, // Veikkausliiga (Finland)

  // Tier 3 — Americas
  13: 3000,  // Copa Libertadores
  11: 2500,  // Copa Sudamericana
  71: 3500,  // Brasileirão Serie A
  128: 2200, // Liga Profesional (Argentina)
  262: 2000, // Liga MX (Mexico)
  253: 1800, // MLS (USA)

  // Tier 4 — Asia / Middle East
  307: 1500, // Saudi Pro League
  188: 1200, // J1 League (Japan)
  292: 1000, // K League 1 (South Korea)
  169: 900,  // A-League (Australia)

  // Tier 5 — National / International
  1: 6000,   // World Cup
  4: 4000,   // Euro Championship
  5: 3000,   // UEFA Nations League
  6: 2500,   // Africa Cup
  10: 2000,  // Copa America
  29: 1500,  // AFC Asian Cup
}

/** Returns the market-value score for a given league id (0 if unknown). */
export function leagueMarketScore(leagueId: number): number {
  return LEAGUE_MARKET_VALUE[leagueId] ?? 0
}

class ApiFootballError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new ApiFootballError("API_FOOTBALL_KEY tanımlı değil.", 500)
  }

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))

  const res = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate },
  })

  if (!res.ok) {
    throw new ApiFootballError(`API-Football isteği başarısız (${res.status})`, res.status)
  }

  const json = await res.json()
  if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
    const msg = Object.values(json.errors).join(" ")
    throw new ApiFootballError(String(msg || "API-Football hatası"), 502)
  }
  return (json.response as T[]) ?? []
}

/** Best-effort fetch: returns [] instead of throwing so one dead endpoint
 * doesn't sink the whole aggregation. */
async function safeFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
): Promise<T[]> {
  try {
    return await apiFetch<T>(path, params, revalidate)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Raw types
// ---------------------------------------------------------------------------

interface RawFixture {
  fixture: {
    id: number
    date: string
    timestamp: number
    status: { long: string; short: string; elapsed: number | null; extra?: number | null }
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
    elapsedExtra: r.fixture.status.extra ?? null,
    venue: r.fixture.venue?.name ?? null,
    league: {
      id: r.league.id,
      name: r.league.name,
      country: toTurkishCountry(r.league.country),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  const MAX_FIXTURES = 200

  // Fetch all fixtures for the day. Leagues are ranked by their market-value
  // score from the LEAGUE_MARKET_VALUE table; no extra API call needed.
  const raw = await apiFetch<RawFixture>("/fixtures", { date, timezone: "Europe/Istanbul" }, 120)

  const fixtures = raw.map(mapFixture)

  // Sort: higher market-value score first; within the same league sort by kick-off time.
  fixtures.sort((a, b) => {
    const aScore = leagueMarketScore(a.league.id)
    const bScore = leagueMarketScore(b.league.id)
    if (bScore !== aScore) return bScore - aScore // higher score = first
    return a.timestamp - b.timestamp // same score → earlier kick-off first
  })

  // Apply 200-match limit but never cut a league in half:
  // once the running total reaches 200, finish the current league then stop.
  if (fixtures.length <= MAX_FIXTURES) return fixtures

  const result: Fixture[] = []
  let limitReached = false
  let currentLeagueId: number | null = null

  for (const fixture of fixtures) {
    const leagueId = fixture.league.id

    if (!limitReached) {
      result.push(fixture)
      currentLeagueId = leagueId
      if (result.length >= MAX_FIXTURES) {
        limitReached = true
      }
    } else {
      // Limit already reached — only continue while we are still in the same league
      if (leagueId === currentLeagueId) {
        result.push(fixture)
      } else {
        // New league encountered after the limit — stop completely
        break
      }
    }
  }

  return result
}

export async function getFixtureById(id: number): Promise<Fixture | null> {
  const raw = await apiFetch<RawFixture>("/fixtures", { id }, 30)
  if (raw.length === 0) return null
  return mapFixture(raw[0])
}

// ---------------------------------------------------------------------------
// Match detail helpers
// ---------------------------------------------------------------------------

function buildRecentForm(team: TeamInfo, raw: RawFixture[]): FormGame[] {
  const games: FormGame[] = []
  for (const r of raw) {
    if (!/FT|AET|PEN/.test(r.fixture.status.short)) continue
    const isHome = r.teams.home.id === team.id
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({ opponent, scored, conceded, result, home: isHome, date: r.fixture.date })
  }
  return games
}

async function getTeamSeasonStats(
  team: TeamInfo,
  leagueId: number,
  season: number,
): Promise<TeamSeasonStats | null> {
  const [statsArr, recentRaw] = await Promise.all([
    safeFetch<any>("/teams/statistics", { team: team.id, league: leagueId, season }, 3600),
    safeFetch<RawFixture>("/fixtures", { team: team.id, last: 6 }, 600),
  ])

  const recent = buildRecentForm(team, recentRaw).slice(0, 6)
  const s = Array.isArray(statsArr) ? (statsArr as any) : statsArr
  const stat = (s && (s.fixtures ? s : s[0])) as any

  if (!stat || !stat.fixtures) {
    // No season stats (e.g. cup game). Derive a minimal record from recent form.
    if (recent.length === 0) return null
    const wins = recent.filter((g) => g.result === "W").length
    const draws = recent.filter((g) => g.result === "D").length
    const losses = recent.filter((g) => g.result === "L").length
    const gf = recent.reduce((a, g) => a + g.scored, 0)
    const ga = recent.reduce((a, g) => a + g.conceded, 0)
    return {
      team,
      formString: recent.map((g) => g.result).reverse().join(""),
      played: recent.length,
      wins,
      draws,
      losses,
      goalsForAvg: gf / recent.length,
      goalsAgainstAvg: ga / recent.length,
      cleanSheets: recent.filter((g) => g.conceded === 0).length,
      failedToScore: recent.filter((g) => g.scored === 0).length,
      recent,
    }
  }

  const num = (v: unknown): number => {
    const n = typeof v === "string" ? Number.parseFloat(v) : Number(v)
    return Number.isFinite(n) ? n : 0
  }

  return {
    team,
    formString: (stat.form ?? "").slice(-6),
    played: num(stat.fixtures?.played?.total),
    wins: num(stat.fixtures?.wins?.total),
    draws: num(stat.fixtures?.draws?.total),
    losses: num(stat.fixtures?.loses?.total),
    goalsForAvg: num(stat.goals?.for?.average?.total),
    goalsAgainstAvg: num(stat.goals?.against?.average?.total),
    cleanSheets: num(stat.clean_sheet?.total),
    failedToScore: num(stat.failed_to_score?.total),
    recent,
  }
}

async function getHeadToHead(homeId: number, awayId: number): Promise<FormGame[]> {
  const raw = await safeFetch<RawFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 8 }, 3600)
  raw.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
  const games: FormGame[] = []
  for (const r of raw) {
    if (!/FT|AET|PEN/.test(r.fixture.status.short)) continue
    const isHome = r.teams.home.id === homeId
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({
      opponent, scored, conceded, result, home: isHome, date: r.fixture.date,
      homeTeam: r.teams.home.name,
      awayTeam: r.teams.away.name,
    })
  }
  return games
}

async function getStandings(leagueId: number, season: number, teamIds: number[]): Promise<StandingRow[]> {
  const raw = await safeFetch<any>("/standings", { league: leagueId, season }, 3600)
  if (raw.length === 0) return []
  const league = raw[0]?.league
  const groups: any[][] = league?.standings ?? []
  const rows: StandingRow[] = []
  for (const group of groups) {
    for (const row of group) {
      rows.push({
        rank: row.rank,
        team: row.team?.name ?? "",
        teamId: row.team?.id ?? 0,
        points: row.points ?? 0,
        played: row.all?.played ?? 0,
        win: row.all?.win ?? 0,
        draw: row.all?.draw ?? 0,
        lose: row.all?.lose ?? 0,
        goalsFor: row.all?.goals?.for ?? 0,
        goalsAgainst: row.all?.goals?.against ?? 0,
        form: row.form ?? null,
        group: row.group ?? league?.name ?? "",
      })
    }
  }
  // Keep only the group(s) that contain our two teams to reduce payload.
  const relevantGroups = new Set(rows.filter((r) => teamIds.includes(r.teamId)).map((r) => r.group))
  if (relevantGroups.size > 0) return rows.filter((r) => relevantGroups.has(r.group))
  return rows
}

async function getInjuries(fixtureId: number): Promise<InjuryItem[]> {
  const raw = await safeFetch<any>("/injuries", { fixture: fixtureId }, 1800)
  return raw.map((r) => ({
    team: r.team?.name ?? "",
    player: r.player?.name ?? "",
    playerId: r.player?.id ?? null,
    reason: r.player?.reason ?? "",
    type: r.player?.type ?? "",
  }))
}

async function getEvents(fixtureId: number): Promise<MatchEvent[]> {
  const raw = await safeFetch<any>("/fixtures/events", { fixture: fixtureId }, 30)
  return raw.map((r) => ({
    minute: r.time?.elapsed ?? 0,
    extra: r.time?.extra ?? null,
    team: r.team?.name ?? "",
    player: r.player?.name ?? null,
    playerId: r.player?.id ?? null,
    assist: r.assist?.name ?? null,
    assistId: r.assist?.id ?? null,
    type: r.type ?? "",
    detail: r.detail ?? "",
  }))
}

async function getStatistics(fixtureId: number): Promise<StatItem[]> {
  const raw = await safeFetch<any>("/fixtures/statistics", { fixture: fixtureId }, 30)
  if (raw.length < 2) return []
  const home = raw[0]?.statistics ?? []
  const away = raw[1]?.statistics ?? []
  const items: StatItem[] = []
  for (let i = 0; i < home.length; i++) {
    items.push({
      type: home[i]?.type ?? "",
      home: home[i]?.value ?? null,
      away: away[i]?.value ?? null,
    })
  }
  return items
}

async function getLineups(fixtureId: number): Promise<TeamLineup[]> {
  const raw = await safeFetch<any>("/fixtures/lineups", { fixture: fixtureId }, 300)
  const mapPlayers = (arr: any[]): LineupPlayer[] =>
    (arr ?? []).map((p) => ({
      id: p.player?.id ?? null,
      number: p.player?.number ?? null,
      name: p.player?.name ?? "",
      pos: p.player?.pos ?? null,
      grid: p.player?.grid ?? null,
    }))
  return raw.map((r) => ({
    team: r.team?.name ?? "",
    formation: r.formation ?? null,
    coach: r.coach?.name ?? null,
    startXI: mapPlayers(r.startXI),
    substitutes: mapPlayers(r.substitutes),
  }))
}

// ---------------------------------------------------------------------------
// Fixture player stats (per-player match performance)
// ---------------------------------------------------------------------------

export async function getFixturePlayerStats(fixtureId: number): Promise<FixturePlayerStat[]> {
  const raw = await safeFetch<any>("/fixtures/players", { fixture: fixtureId }, 60)
  const result: FixturePlayerStat[] = []
  for (const teamBlock of raw) {
    const teamName: string = teamBlock?.team?.name ?? ""
    const teamId: number = teamBlock?.team?.id ?? 0
    for (const entry of teamBlock?.players ?? []) {
      const p = entry.player
      const s = entry.statistics?.[0]
      result.push({
        team: teamName,
        teamId,
        player: {
          id: p?.id ?? 0,
          name: p?.name ?? "",
          photo: p?.photo ?? null,
          number: s?.games?.number ?? null,
          pos: s?.games?.position ?? null,
        },
        rating: s?.games?.rating ?? null,
        minutes: s?.games?.minutes ?? null,
        goals: s?.goals?.total ?? null,
        assists: s?.goals?.assists ?? null,
        yellowCard: !!s?.cards?.yellow,
        redCard: !!s?.cards?.red,
        shots: s?.shots?.total ?? null,
        shotsOn: s?.shots?.on ?? null,
        passes: s?.passes?.total ?? null,
        passesAccuracy: s?.passes?.accuracy ?? null,
        tackles: s?.tackles?.total ?? null,
        dribbles: s?.dribbles?.attempts ?? null,
        captain: !!s?.games?.captain,
        substitute: !!s?.games?.substitute,
      })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Aggregators
// ---------------------------------------------------------------------------

/** Gathers the full live/contextual dataset for the detail panel. */
export async function getLiveMatchData(fixture: Fixture): Promise<LiveMatchData> {
  const { id, home, away, league } = fixture
  const [events, statistics, lineups, standings, injuries, h2h, homeStats, awayStats] =
    await Promise.all([
      getEvents(id),
      getStatistics(id),
      getLineups(id),
      getStandings(league.id, league.season, [home.id, away.id]),
      getInjuries(id),
      getHeadToHead(home.id, away.id),
      getTeamSeasonStats(home, league.id, league.season),
      getTeamSeasonStats(away, league.id, league.season),
    ])

  return {
    fixture,
    events,
    statistics,
    lineups,
    standings,
    injuries,
    h2h,
    homeStats,
    awayStats,
  }
}


