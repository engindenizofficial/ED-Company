import type {
  Fixture,
  FormGame,
  InjuryItem,
  LineupPlayer,
  LiveMatchData,
  MatchEvent,
  StandingRow,
  StatItem,
  TeamInfo,
  TeamLineup,
  TeamSeasonStats,
} from "./types"

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
  848, // Conference League
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
  } catch (err) {
    console.log(`[v0] api-football ${path} failed:`, err instanceof Error ? err.message : err)
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function getFixturesByDate(date: string): Promise<Fixture[]> {
  const raw = await apiFetch<RawFixture>("/fixtures", { date, timezone: "Europe/Istanbul" }, 120)
  const fixtures = raw.map(mapFixture)

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
    games.push({ opponent, scored, conceded, result, home: isHome, date: r.fixture.date })
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
    assist: r.assist?.name ?? null,
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

/**
 * Builds the complete data blob sent to Gemini.
 */
export async function getGeminiInput(fixture: Fixture): Promise<{
  live: LiveMatchData
}> {
  const live = await getLiveMatchData(fixture)
  return { live }
}
