import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type {
  Fixture,
  LeaguePageData,
  LeagueTopAssist,
  LeagueTopCard,
  LeagueTopScorer,
  StandingRow,
  TeamInfo,
} from "@/lib/types"

export const dynamic = "force-dynamic"

function apiFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 3600,
): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { revalidate })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

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
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
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
    referee: null,
    refereeCountry: null,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = Number(searchParams.get("leagueId"))
  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: "leagueId gerekli." }, { status: 400 })
  }

  const season = currentSeason()

  // Paralel olarak tüm veriyi çek
  const [leagueRaw, standingsRaw, topScorersRaw, topAssistsRaw, recentRaw, upcomingRaw, topYellowRaw, topRedRaw] =
    await Promise.all([
      apiFetch<any>("/leagues", { id: leagueId, season }),
      apiFetch<any>("/standings", { league: leagueId, season }),
      apiFetch<any>("/players/topscorers", { league: leagueId, season }),
      apiFetch<any>("/players/topassists", { league: leagueId, season }),
      apiFetch<RawFixture>("/fixtures", { league: leagueId, season, last: 10 }),
      apiFetch<RawFixture>("/fixtures", { league: leagueId, season, next: 10 }),
      apiFetch<any>("/players/topyellowcards", { league: leagueId, season }),
      apiFetch<any>("/players/topredcards", { league: leagueId, season }),
    ])

  if (!leagueRaw || leagueRaw.length === 0) {
    return NextResponse.json({ error: "Lig bulunamadı." }, { status: 404 })
  }

  const rawLeague = leagueRaw[0]
  const leagueInfo = {
    id: rawLeague.league?.id ?? leagueId,
    name: rawLeague.league?.name ?? "",
    country: toTurkishCountry(rawLeague.country?.name ?? ""),
    logo: rawLeague.league?.logo ?? "",
    season,
    flagUrl: rawLeague.country?.flag ?? null,
  }

  // Puan durumu
  const standings: StandingRow[] = []
  for (const entry of standingsRaw ?? []) {
    const groups: any[][] = entry?.league?.standings ?? []
    for (const group of groups) {
      for (const row of group) {
        standings.push({
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
          group: row.group ?? entry?.league?.name ?? "",
        })
      }
    }
  }

  // Top scorers
  const topScorers: LeagueTopScorer[] = (topScorersRaw ?? []).slice(0, 20).map((entry: any) => {
    const teamInfo: TeamInfo = {
      id: entry.statistics?.[0]?.team?.id ?? 0,
      name: entry.statistics?.[0]?.team?.name ?? "",
      logo: entry.statistics?.[0]?.team?.logo ?? "",
    }
    return {
      player: {
        id: entry.player?.id ?? 0,
        name: entry.player?.name ?? "",
        photo: entry.player?.photo ?? null,
        nationality: entry.player?.nationality ?? null,
      },
      team: teamInfo,
      goals: entry.statistics?.[0]?.goals?.total ?? 0,
      assists: entry.statistics?.[0]?.goals?.assists ?? 0,
      appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
      rating: entry.statistics?.[0]?.games?.rating ?? null,
      yellowCards: entry.statistics?.[0]?.cards?.yellow ?? 0,
      redCards: entry.statistics?.[0]?.cards?.red ?? 0,
      pos: entry.statistics?.[0]?.games?.position ?? null,
    }
  })

  // Top assists
  const topAssists: LeagueTopAssist[] = (topAssistsRaw ?? []).slice(0, 20).map((entry: any) => {
    const teamInfo: TeamInfo = {
      id: entry.statistics?.[0]?.team?.id ?? 0,
      name: entry.statistics?.[0]?.team?.name ?? "",
      logo: entry.statistics?.[0]?.team?.logo ?? "",
    }
    return {
      player: {
        id: entry.player?.id ?? 0,
        name: entry.player?.name ?? "",
        photo: entry.player?.photo ?? null,
        nationality: entry.player?.nationality ?? null,
      },
      team: teamInfo,
      assists: entry.statistics?.[0]?.goals?.assists ?? 0,
      goals: entry.statistics?.[0]?.goals?.total ?? 0,
      appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
      rating: entry.statistics?.[0]?.games?.rating ?? null,
    }
  })

  // Top yellow cards
  const topYellowCards: LeagueTopCard[] = (topYellowRaw ?? []).slice(0, 20).map((entry: any) => ({
    player: {
      id: entry.player?.id ?? 0,
      name: entry.player?.name ?? "",
      photo: entry.player?.photo ?? null,
      nationality: entry.player?.nationality ?? null,
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

  // Top red cards
  const topRedCards: LeagueTopCard[] = (topRedRaw ?? []).slice(0, 20).map((entry: any) => ({
    player: {
      id: entry.player?.id ?? 0,
      name: entry.player?.name ?? "",
      photo: entry.player?.photo ?? null,
      nationality: entry.player?.nationality ?? null,
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

  // Son maçlar (biten)
  const recentFixtures: Fixture[] = [...recentRaw]
    .filter((r) => /FT|AET|PEN/.test(r.fixture.status.short))
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 10)
    .map(mapFixture)

  // Yaklaşan maçlar
  const upcomingFixtures: Fixture[] = [...upcomingRaw]
    .filter((r) => r.fixture.status.short === "NS")
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
    .slice(0, 10)
    .map(mapFixture)

  // Sezon özet istatistikleri — puan durumundan hesapla
  let seasonStats = null
  if (standings.length > 0) {
    const totalMatches = Math.floor(
      standings.reduce((s, r) => s + r.played, 0) / 2,
    )
    const totalGoals = standings.reduce((s, r) => s + r.goalsFor, 0)
    const avgGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 0
    // Kart sayılarını topyellowcards / topredcards listelerinden topla
    const yellowCards = (topYellowRaw ?? []).reduce(
      (s: number, e: any) => s + (e.statistics?.[0]?.cards?.yellow ?? 0), 0,
    )
    const redCards = (topRedRaw ?? []).reduce(
      (s: number, e: any) => s + (e.statistics?.[0]?.cards?.red ?? 0), 0,
    )
    seasonStats = {
      totalMatches,
      totalGoals,
      avgGoalsPerMatch: parseFloat(avgGoalsPerMatch.toFixed(2)),
      yellowCards,
      redCards,
    }
  }

  const payload: LeaguePageData = {
    league: leagueInfo,
    standings,
    topScorers,
    topAssists,
    topYellowCards,
    topRedCards,
    recentFixtures,
    upcomingFixtures,
    seasonStats,
    cachedAt: Date.now(),
  }

  return NextResponse.json(payload)
}
