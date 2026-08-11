import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getTeamMarketValues } from "@/lib/market-values"
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueTopAssist,
  LeagueTopCard,
  LeagueTopScorer,
  StandingRow,
} from "@/lib/types"

export const dynamic = "force-dynamic"

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

// Piyasa değerini yalnızca DB'deki teamMarketValue tablosundan okur (bkz.
// lib/market-values.ts) — asla canlı scrape tetiklemez, sadece haftalık
// cron'un doldurduğu veriyi gösterir.
async function fetchStandings(leagueId: number, season: number): Promise<StandingRow[]> {
  const standingsRaw = await apiFetch<any>("/standings", { league: leagueId, season })
  const standings: StandingRow[] = []
  for (const entry of standingsRaw ?? []) {
    const groups: any[][] = entry?.league?.standings ?? []
    for (const group of groups) {
      for (const row of group) {
        standings.push({
          rank: row.rank, team: row.team?.name ?? "", teamId: row.team?.id ?? 0,
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

  if (standings.length > 0) {
    const teamIds = [...new Set(standings.map((r) => r.teamId).filter((id) => id > 0))]
    const values = await getTeamMarketValues(teamIds)
    for (const row of standings) {
      row.marketValueEur = values.get(row.teamId)?.totalValueEur ?? null
    }
  }

  return standings
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = Number(searchParams.get("leagueId"))
  const section = searchParams.get("section") as Section | null

  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: "leagueId gerekli." }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "Geçersiz sekme." }, { status: 400 })
  }

  const season = currentSeason()

  try {
    switch (section) {
      case "seasonStats": {
        const [standings, topYellowRaw, topRedRaw] = await Promise.all([
          fetchStandings(leagueId, season),
          apiFetch<any>("/players/topyellowcards", { league: leagueId, season }),
          apiFetch<any>("/players/topredcards", { league: leagueId, season }),
        ])
        if (standings.length === 0) return NextResponse.json({ data: null })
        const totalMatches = Math.floor(standings.reduce((s, r) => s + r.played, 0) / 2)
        const totalGoals = standings.reduce((s, r) => s + r.goalsFor, 0)
        const avgGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 0
        const yellowCards = (topYellowRaw ?? []).reduce((s: number, e: any) => s + (e.statistics?.[0]?.cards?.yellow ?? 0), 0)
        const redCards = (topRedRaw ?? []).reduce((s: number, e: any) => s + (e.statistics?.[0]?.cards?.red ?? 0), 0)
        const knownValues = standings.map((r) => r.marketValueEur).filter((v): v is number => v !== null && v !== undefined)
        const totalMarketValueEur = knownValues.length > 0 ? knownValues.reduce((s, v) => s + v, 0) : null
        const data: LeagueSeasonStats = {
          totalMatches,
          totalGoals,
          avgGoalsPerMatch: parseFloat(avgGoalsPerMatch.toFixed(2)),
          yellowCards,
          redCards,
          totalMarketValueEur,
        }
        return NextResponse.json({ data })
      }

      case "standings": {
        const standings = await fetchStandings(leagueId, season)
        if (standings.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data: standings })
      }

      case "topScorers": {
        const raw = await apiFetch<any>("/players/topscorers", { league: leagueId, season })
        const data: LeagueTopScorer[] = (raw ?? []).slice(0, 20).map((entry: any) => ({
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
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "topAssists": {
        const raw = await apiFetch<any>("/players/topassists", { league: leagueId, season })
        const data: LeagueTopAssist[] = (raw ?? []).slice(0, 20).map((entry: any) => ({
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
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "topYellowCards": {
        const raw = await apiFetch<any>("/players/topyellowcards", { league: leagueId, season })
        const data: LeagueTopCard[] = (raw ?? []).slice(0, 20).map((entry: any) => ({
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
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "topRedCards": {
        const raw = await apiFetch<any>("/players/topredcards", { league: leagueId, season })
        const data: LeagueTopCard[] = (raw ?? []).slice(0, 20).map((entry: any) => ({
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
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "recentFixtures": {
        const raw = await apiFetch<RawFixture>("/fixtures", { league: leagueId, season, last: 10 })
        const data: Fixture[] = [...(raw ?? [])]
          .filter((r) => /FT|AET|PEN/.test(r.fixture.status.short))
          .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
          .slice(0, 10)
          .map(mapFixture)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "upcomingFixtures": {
        const raw = await apiFetch<RawFixture>("/fixtures", { league: leagueId, season, next: 10 })
        const data: Fixture[] = [...(raw ?? [])]
          .filter((r) => r.fixture.status.short === "NS")
          .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
          .slice(0, 10)
          .map(mapFixture)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
