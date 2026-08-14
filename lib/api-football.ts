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
  SquadPlayer,
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
import { apiFootballFetch, safeApiFootballFetch } from "./api-football-client"
import { FEATURED_LEAGUE_IDS } from "./leagues"

// ---------------------------------------------------------------------------
// Featured leagues — tek kaynak lib/leagues.ts'de tanımlı. Bu diziye buradan
// erişilir ki maç listesi sıralaması, arama kutusu (TOP_LEAGUES) ve
// Transfermarkt cron'u (SCRAPABLE_LEAGUE_IDS) hep aynı listeden türesin.
// Yeni bir lig eklemek/çıkarmak için lib/leagues.ts'i güncelle.
// ---------------------------------------------------------------------------
export { FEATURED_LEAGUE_IDS }

/** Returns the priority rank for a league: 0 = highest (first in list), Infinity = not featured. */
function featuredRank(leagueId: number): number {
  const idx = FEATURED_LEAGUE_IDS.indexOf(leagueId)
  return idx === -1 ? Infinity : idx
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
  forceRefresh = false,
): Promise<T[]> {
  // forceRefresh: Next.js fetch cache'ini VE api-football-client'taki bellek
  // içi 90s cache'i atlayıp API-Football'dan her zaman taze veri çeker.
  // Kullanıcı "yenile" dediğinde gerçekten yeni veri gelmesini garantiler.
  return apiFootballFetch<T>(path, params, forceRefresh ? { cache: "no-store" } : { revalidate })
}

/** Best-effort fetch: returns [] instead of throwing so one dead endpoint
 * doesn't sink the whole aggregation. */
async function safeFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { revalidate })
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
    referee: string | null
  }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

/** API-Football hakemi "Ad Soyad (Ülke)" formatında döndürür. İkisini ayır. */
function parseReferee(raw: string | null): { name: string | null; country: string | null } {
  if (!raw) return { name: null, country: null }
  const match = raw.match(/^(.+?)\s*\((.+?)\)\s*$/)
  if (match) return { name: match[1].trim(), country: match[2].trim() }
  return { name: raw.trim(), country: null }
}

function mapFixture(r: RawFixture): Fixture {
  const { name: referee, country: refereeCountry } = parseReferee(r.fixture.referee ?? null)
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
    referee,
    refereeCountry,
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function getFixturesByDate(date: string, forceRefresh = false): Promise<Fixture[]> {
  const MAX_FIXTURES = 200

  const raw = await apiFetch<RawFixture>("/fixtures", { date, timezone: "Europe/Istanbul" }, 120, forceRefresh)

  const fixtures = raw.map(mapFixture)

  // For non-featured leagues, compute each league's earliest kick-off time
  // so we can sort leagues as a whole block rather than interleaving matches.
  const leagueFirstKickoff = new Map<number, number>()
  for (const f of fixtures) {
    const rank = featuredRank(f.league.id)
    if (rank === Infinity) {
      const current = leagueFirstKickoff.get(f.league.id)
      if (current === undefined || f.timestamp < current) {
        leagueFirstKickoff.set(f.league.id, f.timestamp)
      }
    }
  }

  // Sort:
  //  1. Featured leagues first, in their defined list order.
  //  2. Non-featured leagues grouped together, ordered by the league's
  //     earliest kick-off time (earlier leagues come first).
  //  3. Within any league, matches are ordered by kick-off time.
  fixtures.sort((a, b) => {
    const aRank = featuredRank(a.league.id)
    const bRank = featuredRank(b.league.id)

    // Both featured — keep list order, then kick-off within league
    if (aRank !== Infinity && bRank !== Infinity) {
      if (aRank !== bRank) return aRank - bRank
      return a.timestamp - b.timestamp
    }

    // One featured, one not — featured always wins
    if (aRank !== Infinity) return -1
    if (bRank !== Infinity) return 1

    // Both non-featured — sort by league's earliest kick-off, then individual time
    const aLeagueTime = leagueFirstKickoff.get(a.league.id) ?? a.timestamp
    const bLeagueTime = leagueFirstKickoff.get(b.league.id) ?? b.timestamp
    if (aLeagueTime !== bLeagueTime) return aLeagueTime - bLeagueTime
    if (a.league.id !== b.league.id) return a.league.id - b.league.id
    return a.timestamp - b.timestamp
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

export async function getTeamSeasonStats(
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

export async function getHeadToHead(homeId: number, awayId: number): Promise<FormGame[]> {
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

export async function getStandings(leagueId: number, season: number, teamIds: number[]): Promise<StandingRow[]> {
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
        teamLogo: row.team?.logo ?? "",
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

async function getOdds(fixtureId: number): Promise<{ home: number | null; draw: number | null; away: number | null }> {
  const raw = await safeFetch<any>("/odds", { fixture: fixtureId }, 3600)
  if (!raw.length) return { home: null, draw: null, away: null }

  // İlk bookmaker'ın "Match Winner" (veya "1X2") bahsini bul
  for (const entry of raw) {
    for (const bookmaker of entry.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) {
        const name: string = (bet.name ?? "").toLowerCase()
        if (name.includes("match winner") || name === "1x2") {
          const values: Array<{ value: string; odd: string }> = bet.values ?? []
          const parse = (label: string) => {
            const found = values.find((v) => v.value.toLowerCase() === label)
            return found ? parseFloat(found.odd) : null
          }
          return {
            home: parse("home"),
            draw: parse("draw"),
            away: parse("away"),
          }
        }
      }
    }
  }
  return { home: null, draw: null, away: null }
}

export async function getSquad(teamId: number): Promise<SquadPlayer[]> {
  const raw = await safeFetch<any>("/players/squads", { team: teamId }, 3600)
  if (!raw.length) return []
  const players: any[] = raw[0]?.players ?? []
  return players.map((p) => ({
    id: p.id ?? 0,
    name: p.name ?? "",
    age: p.age ?? null,
    number: p.number ?? null,
    pos: p.position ?? null,
    photo: p.photo ?? null,
    // Bu fonksiyon maç analiz paneli (homeSquad/awaySquad) ve eşleştirme
    // modülü tarafından kullanılıyor — piyasa değeri orada gösterilmiyor.
    // Takım panelindeki kadro sekmesi piyasa değerini ayrıca
    // /api/team/section üzerinden DB'den okuyup dolduruyor.
    marketValueEur: null,
  }))
}

/**
 * Bir takımın API-Football'daki menşei ülkesini döndürür. SADECE piyasa
 * değeri manuel gözden geçirme kuyruğu (review queue) için kullanılır —
 * belirsiz eşleşmelerde admin'e Transfermarkt adayıyla karşılaştırma imkanı
 * verir. Otomatik eşleşen takımlar için çağrılmaz.
 */
export async function getTeamCountry(teamId: number): Promise<string | null> {
  const raw = await safeFetch<any>("/teams", { id: teamId }, 3600)
  const country = raw[0]?.team?.country ?? null
  return country ? toTurkishCountry(country) : null
}

/**
 * Bir oyuncunun API-Football'daki uyruğunu döndürür. SADECE piyasa değeri
 * manuel gözden geçirme kuyruğu için kullanılır (bkz. getTeamCountry).
 */
export async function getPlayerNationality(playerId: number, season: number): Promise<string | null> {
  const raw = await safeFetch<any>("/players", { id: playerId, season }, 3600)
  const nationality = raw[0]?.player?.nationality ?? null
  return nationality ? toTurkishCountry(nationality) : null
}

export async function getInjuries(fixtureId: number): Promise<InjuryItem[]> {
  const raw = await safeFetch<any>("/injuries", { fixture: fixtureId }, 1800)
  return raw.map((r) => ({
    team: r.team?.name ?? "",
    player: r.player?.name ?? "",
    playerId: r.player?.id ?? null,
    reason: r.player?.reason ?? "",
    type: r.player?.type ?? "",
  }))
}

export async function getEvents(fixtureId: number): Promise<MatchEvent[]> {
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

export async function getStatistics(fixtureId: number): Promise<StatItem[]> {
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

export async function getLineups(fixtureId: number): Promise<TeamLineup[]> {
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
  const [events, statistics, lineups, standings, injuries, h2h, homeStats, awayStats, odds, homeSquad, awaySquad] =
    await Promise.all([
      getEvents(id),
      getStatistics(id),
      getLineups(id),
      getStandings(league.id, league.season, [home.id, away.id]),
      getInjuries(id),
      getHeadToHead(home.id, away.id),
      getTeamSeasonStats(home, league.id, league.season),
      getTeamSeasonStats(away, league.id, league.season),
      getOdds(id),
      getSquad(home.id),
      getSquad(away.id),
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
    odds,
    homeSquad,
    awaySquad,
  }
}


