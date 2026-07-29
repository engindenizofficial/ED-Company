import { NextResponse } from "next/server"
import type { Fixture, SquadPlayer, StandingRow, TeamInfo, TeamPageData, TeamSeasonStats } from "@/lib/types"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as T[]) ?? []
  } catch {
    return []
  }
}

function currentSeason(): number {
  const now = new Date()
  // Football seasons: Aug–May. If month >= August, season = current year, else previous year.
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

interface RawFixture {
  fixture: { id: number; date: string; timestamp: number; status: { long: string; short: string; elapsed: number | null }; venue: { name: string | null } }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: { home: { id: number; name: string; logo: string; winner: boolean | null }; away: { id: number; name: string; logo: string; winner: boolean | null } }
  goals: { home: number | null; away: number | null }
}

function mapFixture(r: RawFixture): Fixture {
  return {
    id: r.fixture.id, date: r.fixture.date, timestamp: r.fixture.timestamp,
    status: r.fixture.status.long, statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null, venue: r.fixture.venue?.name ?? null,
    league: { id: r.league.id, name: r.league.name, country: r.league.country, logo: r.league.logo, season: r.league.season, round: r.league.round },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home, goalsAway: r.goals.away,
  }
}

interface RawFormGame { fixture: { status: { short: string }; date: string }; league: { id: number; season: number }; teams: { home: { id: number; name: string; winner: boolean | null }; away: { id: number; name: string; winner: boolean | null } }; goals: { home: number | null; away: number | null } }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamId = Number(searchParams.get("teamId"))
  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "teamId gerekli." }, { status: 400 })
  }

  const season = currentSeason()

  // Paralel çek: takım bilgisi, sezon istatistikleri, kadro, son maçlar, puan durumu
  const [teamRaw, statsRaw, squadRaw, recentRaw, standingsRaw] = await Promise.all([
    apiFetch<any>("/teams", { id: teamId }),
    apiFetch<any>("/teams/statistics", { team: teamId, season }),
    apiFetch<any>("/players/squads", { team: teamId }),
    apiFetch<RawFixture>("/fixtures", { team: teamId, last: 10 }),
    apiFetch<any>("/standings", { team: teamId, season }),
  ])

  if (!teamRaw || teamRaw.length === 0) {
    return NextResponse.json({ error: "Takım bulunamadı." }, { status: 404 })
  }

  // Team & venue
  const rawTeam = teamRaw[0]
  const team: TeamInfo = { id: rawTeam.team.id, name: rawTeam.team.name, logo: rawTeam.team.logo }
  const venue = {
    name: rawTeam.venue?.name ?? null,
    city: rawTeam.venue?.city ?? null,
    capacity: rawTeam.venue?.capacity ?? null,
  }

  // Stats
  const num = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : Number(v); return isFinite(n) ? n : 0 }
  let teamStats: TeamSeasonStats | null = null
  const s = statsRaw?.[0] as any
  if (s?.fixtures) {
    // Build recent form from last 6 finished fixtures
    const recentFinished = [...recentRaw]
      .filter(r => /FT|AET|PEN/.test(r.fixture.status.short))
      .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
      .slice(0, 6)

    const recent = recentFinished.map(r => {
      const isHome = r.teams.home.id === teamId
      const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
      const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
      const opponent = isHome ? r.teams.away.name : r.teams.home.name
      const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
      return { opponent, scored, conceded, result, home: isHome, date: r.fixture.date }
    })

    teamStats = {
      team,
      formString: (s.form ?? "").slice(-8),
      played: num(s.fixtures?.played?.total),
      wins: num(s.fixtures?.wins?.total),
      draws: num(s.fixtures?.draws?.total),
      losses: num(s.fixtures?.loses?.total),
      goalsForAvg: num(s.goals?.for?.average?.total),
      goalsAgainstAvg: num(s.goals?.against?.average?.total),
      cleanSheets: num(s.clean_sheet?.total),
      failedToScore: num(s.failed_to_score?.total),
      recent,
    }
  }

  // Squad
  const squadData = squadRaw?.[0] as any
  const players: SquadPlayer[] = (squadData?.players ?? []).map((p: any) => ({
    id: p.id, name: p.name, age: p.age ?? null,
    number: p.number ?? null, pos: p.position ?? null, photo: p.photo ?? null,
  }))

  // Recent fixtures (last 10, sorted desc)
  const recentFixtures: Fixture[] = [...recentRaw]
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 10)
    .map(mapFixture)

  // Standings — flatten all groups
  const standings: StandingRow[] = []
  for (const entry of standingsRaw ?? []) {
    const groups: any[][] = entry?.league?.standings ?? []
    for (const group of groups) {
      for (const row of group) {
        standings.push({
          rank: row.rank, team: row.team?.name ?? "", teamId: row.team?.id ?? 0,
          points: row.points ?? 0, played: row.all?.played ?? 0,
          win: row.all?.win ?? 0, draw: row.all?.draw ?? 0, lose: row.all?.lose ?? 0,
          goalsFor: row.all?.goals?.for ?? 0, goalsAgainst: row.all?.goals?.against ?? 0,
          form: row.form ?? null, group: row.group ?? entry?.league?.name ?? "",
        })
      }
    }
  }

  const payload: TeamPageData = { team, venue, currentSeason: season, stats: teamStats, squad: players, recentFixtures, standings, fetchedAt: Date.now() }
  return NextResponse.json(payload)
}
