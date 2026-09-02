import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getLeagueMarketValueByTeamIds, getTeamMarketValueMapByTeamIds } from "@/lib/search/market-index"
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueTopAssist,
  LeagueTopCard,
  LeagueTopScorer,
  StandingRow,
} from "@/lib/types"

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStoreJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

// Lig panelindeki her sekme kendi verisini, sadece o sekmeye tıklandığında
// bu endpoint üzerinden ayrı ayrı çeker. Böylece panel açılışında 8 endpoint
// birden aynı anda çekilmiyor; her sekme yalnızca ihtiyacı olan endpoint(ler)i
// tetikliyor — bkz. components/league-panel.tsx içindeki useLeagueSection hook'u.
const VALID_SECTIONS = [
  "seasonStats",
  "standings",
  "topScorers",
  "topAssists",
  "topYellowCards",
  "topRedCards",
  "recentFixtures",
  "upcomingFixtures",
] as const
type Section = (typeof VALID_SECTIONS)[number]

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

interface RawStandingRow {
  rank?: number
  team?: { id?: number; name?: string; logo?: string }
  points?: number
  all?: { played?: number; win?: number; draw?: number; lose?: number; goals?: { for?: number; against?: number } }
  form?: string | null
  group?: string
}

interface RawStandingEntry {
  league?: { name?: string; standings?: RawStandingRow[][] }
}

interface RawTeamEntry {
  team?: { id?: number }
}

interface RawPlayerRankingEntry {
  player?: { id?: number; name?: string; photo?: string | null; nationality?: string | null }
  statistics?: Array<{
    team?: { id?: number; name?: string; logo?: string }
    goals?: { total?: number; assists?: number }
    games?: { appearences?: number; rating?: string | null; position?: string | null }
    cards?: { yellow?: number; red?: number }
  }>
}

interface RawFixture {
  fixture: {
    id: number; date: string; timestamp: number
    status: { long: string; short: string; elapsed: number | null; extra?: number | null }
    venue: { name: string | null }
  }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
  }
  goals: { home: number | null; away: number | null }
}

function mapFixture(r: RawFixture): Fixture {
  return {
    id: r.fixture.id, date: r.fixture.date, timestamp: r.fixture.timestamp,
    status: r.fixture.status.long, statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null, elapsedExtra: r.fixture.status.extra ?? null,
    venue: r.fixture.venue?.name ?? null,
    league: { id: r.league.id, name: r.league.name, country: toTurkishCountry(r.league.country), logo: r.league.logo, season: r.league.season, round: r.league.round },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home, goalsAway: r.goals.away,
    referee: null,
    refereeCountry: null,
  }
}

async function fetchLeagueTeamIds(leagueId: number, season: number): Promise<number[]> {
  const teams = await apiFetch<RawTeamEntry>("/teams", { league: leagueId, season })
  return [...new Set(teams.flatMap((entry) => {
    const teamId = entry.team?.id
    return Number.isInteger(teamId) && (teamId ?? 0) > 0 ? [teamId as number] : []
  }))]
}

async function fetchStandings(leagueId: number, season: number): Promise<StandingRow[]> {
  const standingsRaw = await apiFetch<RawStandingEntry>("/standings", { league: leagueId, season })
  const standings: StandingRow[] = []
  for (const entry of standingsRaw ?? []) {
    const groups: RawStandingRow[][] = entry?.league?.standings ?? []
    for (const group of groups) {
      for (const row of group) {
        standings.push({
          rank: row.rank ?? 0, team: row.team?.name ?? "", teamId: row.team?.id ?? 0,
          teamLogo: row.team?.logo ?? "",
          points: row.points ?? 0, played: row.all?.played ?? 0,
          win: row.all?.win ?? 0, draw: row.all?.draw ?? 0, lose: row.all?.lose ?? 0,
          goalsFor: row.all?.goals?.for ?? 0, goalsAgainst: row.all?.goals?.against ?? 0,
          form: row.form ?? null, group: row.group ?? entry?.league?.name ?? "",
          marketValueEur: null,
        })
      }
    }
  }

  const marketValues = await getTeamMarketValueMapByTeamIds(standings.map((row) => row.teamId))
  return standings.map((row) => ({
    ...row,
    marketValueEur: marketValues.get(row.teamId) ?? null,
  }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = Number(searchParams.get("leagueId"))
  const section = searchParams.get("section") as Section | null

  if (!leagueId || isNaN(leagueId)) {
    return noStoreJson({ error: "missingLeagueId" }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return noStoreJson({ error: "invalidSection" }, { status: 400 })
  }

  const season = currentSeason()

  try {
    switch (section) {
      case "seasonStats": {
        const [standings, topYellowRaw, topRedRaw, participantTeamIds] = await Promise.all([
          fetchStandings(leagueId, season),
          apiFetch<RawPlayerRankingEntry>("/players/topyellowcards", { league: leagueId, season }),
          apiFetch<RawPlayerRankingEntry>("/players/topredcards", { league: leagueId, season }),
          fetchLeagueTeamIds(leagueId, season),
        ])
        if (standings.length === 0) return noStoreJson({ data: null })
        const teamIds = participantTeamIds.length > 0
          ? participantTeamIds
          : standings.map((row) => row.teamId)
        const totalMarketValueEur = await getLeagueMarketValueByTeamIds(teamIds)
        const totalMatches = Math.floor(standings.reduce((s, r) => s + r.played, 0) / 2)
        const totalGoals = standings.reduce((s, r) => s + r.goalsFor, 0)
        const avgGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 0
        const yellowCards = (topYellowRaw ?? []).reduce((s: number, e: RawPlayerRankingEntry) => s + (e.statistics?.[0]?.cards?.yellow ?? 0), 0)
        const redCards = (topRedRaw ?? []).reduce((s: number, e: RawPlayerRankingEntry) => s + (e.statistics?.[0]?.cards?.red ?? 0), 0)
        const data: LeagueSeasonStats = {
          totalMatches,
          totalGoals,
          avgGoalsPerMatch: parseFloat(avgGoalsPerMatch.toFixed(2)),
          yellowCards,
          redCards,
          totalMarketValueEur,
        }
        return noStoreJson({ data })
      }

      case "standings": {
        const standings = await fetchStandings(leagueId, season)
        if (standings.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data: standings })
      }

      case "topScorers": {
        const raw = await apiFetch<RawPlayerRankingEntry>("/players/topscorers", { league: leagueId, season })
        const data: LeagueTopScorer[] = (raw ?? []).slice(0, 20).map((entry: RawPlayerRankingEntry) => ({
          player: {
            id: entry.player?.id ?? 0, name: entry.player?.name ?? "",
            photo: entry.player?.photo ?? null, nationality: entry.player?.nationality ?? null,
          },
          team: {
            id: entry.statistics?.[0]?.team?.id ?? 0,
            name: entry.statistics?.[0]?.team?.name ?? "",
            logo: entry.statistics?.[0]?.team?.logo ?? "",
          },
          goals: entry.statistics?.[0]?.goals?.total ?? 0,
          assists: entry.statistics?.[0]?.goals?.assists ?? 0,
          appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
          rating: entry.statistics?.[0]?.games?.rating ?? null,
          yellowCards: entry.statistics?.[0]?.cards?.yellow ?? 0,
          redCards: entry.statistics?.[0]?.cards?.red ?? 0,
          pos: entry.statistics?.[0]?.games?.position ?? null,
        }))
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "topAssists": {
        const raw = await apiFetch<RawPlayerRankingEntry>("/players/topassists", { league: leagueId, season })
        const data: LeagueTopAssist[] = (raw ?? []).slice(0, 20).map((entry: RawPlayerRankingEntry) => ({
          player: {
            id: entry.player?.id ?? 0, name: entry.player?.name ?? "",
            photo: entry.player?.photo ?? null, nationality: entry.player?.nationality ?? null,
          },
          team: {
            id: entry.statistics?.[0]?.team?.id ?? 0,
            name: entry.statistics?.[0]?.team?.name ?? "",
            logo: entry.statistics?.[0]?.team?.logo ?? "",
          },
          assists: entry.statistics?.[0]?.goals?.assists ?? 0,
          goals: entry.statistics?.[0]?.goals?.total ?? 0,
          appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
          rating: entry.statistics?.[0]?.games?.rating ?? null,
        }))
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "topYellowCards": {
        const raw = await apiFetch<RawPlayerRankingEntry>("/players/topyellowcards", { league: leagueId, season })
        const data: LeagueTopCard[] = (raw ?? []).slice(0, 20).map((entry: RawPlayerRankingEntry) => ({
          player: {
            id: entry.player?.id ?? 0, name: entry.player?.name ?? "",
            photo: entry.player?.photo ?? null, nationality: entry.player?.nationality ?? null,
          },
          team: {
            id: entry.statistics?.[0]?.team?.id ?? 0,
            name: entry.statistics?.[0]?.team?.name ?? "",
            logo: entry.statistics?.[0]?.team?.logo ?? "",
          },
          yellow: entry.statistics?.[0]?.cards?.yellow ?? 0,
          red: entry.statistics?.[0]?.cards?.red ?? 0,
          appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
        }))
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "topRedCards": {
        const raw = await apiFetch<RawPlayerRankingEntry>("/players/topredcards", { league: leagueId, season })
        const data: LeagueTopCard[] = (raw ?? []).slice(0, 20).map((entry: RawPlayerRankingEntry) => ({
          player: {
            id: entry.player?.id ?? 0, name: entry.player?.name ?? "",
            photo: entry.player?.photo ?? null, nationality: entry.player?.nationality ?? null,
          },
          team: {
            id: entry.statistics?.[0]?.team?.id ?? 0,
            name: entry.statistics?.[0]?.team?.name ?? "",
            logo: entry.statistics?.[0]?.team?.logo ?? "",
          },
          yellow: entry.statistics?.[0]?.cards?.yellow ?? 0,
          red: entry.statistics?.[0]?.cards?.red ?? 0,
          appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
        }))
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "recentFixtures": {
        const raw = await apiFetch<RawFixture>("/fixtures", { league: leagueId, season, last: 10 })
        const data: Fixture[] = [...(raw ?? [])]
          .filter((r) => /FT|AET|PEN/.test(r.fixture.status.short))
          .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
          .slice(0, 10)
          .map(mapFixture)
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }

      case "upcomingFixtures": {
        const raw = await apiFetch<RawFixture>("/fixtures", { league: leagueId, season, next: 10 })
        const data: Fixture[] = [...(raw ?? [])]
          .filter((r) => r.fixture.status.short === "NS")
          .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
          .slice(0, 10)
          .map(mapFixture)
        if (data.length === 0) return noStoreJson({ data: null })
        return noStoreJson({ data })
      }
    }
  } catch {
    return noStoreJson({ error: "internalError" }, { status: 500 })
  }
}
