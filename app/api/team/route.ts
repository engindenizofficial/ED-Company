import { NextResponse } from "next/server"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type {
  Fixture,
  SquadPlayer,
  StandingRow,
  TeamCoach,
  TeamInfo,
  TeamPageData,
  TeamSeasonStats,
  TeamTopScorer,
  TeamTransfer,
  TeamTrophy,
} from "@/lib/types"

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
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

function mapFixture(r: RawFixture): Fixture {
  return {
    id: r.fixture.id, date: r.fixture.date, timestamp: r.fixture.timestamp,
    status: r.fixture.status.long, statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null, elapsedExtra: r.fixture.status.extra ?? null, venue: r.fixture.venue?.name ?? null,
    league: { id: r.league.id, name: r.league.name, country: toTurkishCountry(r.league.country), logo: r.league.logo, season: r.league.season, round: r.league.round },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home, goalsAway: r.goals.away,
    referee: null,
    refereeCountry: null,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamId = Number(searchParams.get("teamId"))
  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "teamId gerekli." }, { status: 400 })
  }

  const season = currentSeason()

  // Paralel çek: tüm veriler aynı anda isteniyor
  const [
    teamRaw,
    statsRaw,
    squadRaw,
    recentRaw,
    standingsRaw,
    coachRaw,
    trophiesRaw,
    transfersRaw,
    topScorersRaw,
  ] = await Promise.all([
    apiFetch<any>("/teams", { id: teamId }),
    apiFetch<any>("/teams/statistics", { team: teamId, season }),
    apiFetch<any>("/players/squads", { team: teamId }),
    apiFetch<RawFixture>("/fixtures", { team: teamId, last: 15 }),
    apiFetch<any>("/standings", { team: teamId, season }),
    apiFetch<any>("/coachs", { team: teamId }),
    apiFetch<any>("/trophies", { team: teamId }),
    apiFetch<any>("/transfers", { team: teamId }),
    apiFetch<any>("/players/topscorers", { league: 0, season, team: teamId }).catch(() => []),
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
    image: rawTeam.venue?.image ?? null,
  }

  // Stats
  const num = (v: unknown): number => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v)
    return isFinite(n) ? n : 0
  }

  let teamStats: TeamSeasonStats | null = null
  const s = statsRaw?.[0] as any
  if (s?.fixtures) {
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

  // Recent fixtures
  const recentFixtures: Fixture[] = [...recentRaw]
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 15)
    .map(mapFixture)

  // Standings — her entry için league adını referans group olarak kullan (tutarsız row.group yerine)
  const standings: StandingRow[] = []
  const seenStandingKeys = new Set<string>()
  for (const entry of standingsRaw ?? []) {
    const leagueName: string = entry?.league?.name ?? ""
    const groups: any[][] = entry?.league?.standings ?? []
    for (const group of groups) {
      for (const row of group) {
        // Aynı takım+lig kombinasyonunu bir kez ekle
        const sKey = `${row.team?.id ?? 0}-${leagueName}`
        if (seenStandingKeys.has(sKey)) continue
        seenStandingKeys.add(sKey)
        // group label: birden fazla grup varsa (UCL gibi) row.group, tek grupsa leagueName
        const groupLabel = groups.length > 1 && row.group ? row.group : leagueName
        standings.push({
          rank: row.rank, team: row.team?.name ?? "", teamId: row.team?.id ?? 0,
          teamLogo: row.team?.logo ?? "",
          points: row.points ?? 0, played: row.all?.played ?? 0,
          win: row.all?.win ?? 0, draw: row.all?.draw ?? 0, lose: row.all?.lose ?? 0,
          goalsFor: row.all?.goals?.for ?? 0, goalsAgainst: row.all?.goals?.against ?? 0,
          form: row.form ?? null, group: groupLabel,
        })
      }
    }
  }

  // Coach — sadece bu takımda end=null VE en geç start tarihine sahip olan seçilir.
  // Fallback yok: aktif kayıt yoksa coach=null döner (yanlış antrenör gösterilmez).
  let coach: TeamCoach | null = null
  const activeForTeam = (coachRaw ?? []).filter((c: any) =>
    (c.career ?? []).some((j: any) => j.team?.id === teamId && !j.end)
  )
  const currentCoachRaw = activeForTeam.sort((a: any, b: any) => {
    const aStart = (a.career ?? []).find((j: any) => j.team?.id === teamId && !j.end)?.start ?? ""
    const bStart = (b.career ?? []).find((j: any) => j.team?.id === teamId && !j.end)?.start ?? ""
    return bStart.localeCompare(aStart)
  })[0] ?? null

  if (currentCoachRaw) {
    coach = {
      id: currentCoachRaw.id,
      name: currentCoachRaw.name ?? "",
      photo: currentCoachRaw.photo ?? null,
      nationality: currentCoachRaw.nationality ?? null,
      age: currentCoachRaw.age ?? null,
      career: (currentCoachRaw.career ?? []).slice(-5).map((j: any) => ({
        team: { id: j.team?.id, name: j.team?.name ?? "", logo: j.team?.logo ?? "" },
        start: j.start ?? null,
        end: j.end ?? null,
      })),
    }
  }

  // Trophies
  const trophies: TeamTrophy[] = (trophiesRaw ?? []).map((t: any) => ({
    league: t.league ?? "",
    country: toTurkishCountry(t.country ?? ""),
    season: t.season ?? "",
    place: t.place ?? "",
  }))

  // Transfers — tarih sıralı, yön-bağımsız deduplication
  // API aynı transferi hem "gelen" hem "giden" entry olarak döndürebilir.
  // Key'de from/to id'lerini sıralı kullanarak yönden bağımsız hale getiriyoruz.
  const seenTransferKeys = new Set<string>()
  const allTransfers: TeamTransfer[] = []
  for (const entry of transfersRaw ?? []) {
    const player = entry.player ?? {}
    const normalName = (player.name ?? "").toLowerCase().replace(/\s+/g, "")
    for (const tx of entry.transfers ?? []) {
      const fromId = tx.teams?.out?.id ?? 0
      const toId = tx.teams?.in?.id ?? 0
      // from/to çiftini sıralı tut → A→B ile B→A aynı key üretir
      const pairKey = [fromId, toId].sort((a, b) => a - b).join("-")
      const key = `${normalName}-${tx.date ?? ""}-${pairKey}`
      if (seenTransferKeys.has(key)) continue
      seenTransferKeys.add(key)
      allTransfers.push({
        date: tx.date ?? null,
        type: tx.type ?? "",
        teamFrom: { id: fromId, name: tx.teams?.out?.name ?? "", logo: tx.teams?.out?.logo ?? "" },
        teamTo: { id: toId, name: tx.teams?.in?.name ?? "", logo: tx.teams?.in?.logo ?? "" },
        player: { id: player.id ?? 0, name: player.name ?? "", photo: player.photo ?? null },
      })
    }
  }
  const transfers = allTransfers
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 25)

  // Top scorers — try from the league the team plays in
  let topScorers: TeamTopScorer[] = []
  // Try to get top scorers from the league the team is in
  if (standings.length > 0 && standingsRaw?.[0]?.league?.id) {
    const leagueId = standingsRaw[0].league.id
    const leagueTopScorers = await apiFetch<any>("/players/topscorers", { league: leagueId, season })
    topScorers = (leagueTopScorers ?? []).slice(0, 10).map((entry: any) => ({
      player: { id: entry.player?.id ?? 0, name: entry.player?.name ?? "", photo: entry.player?.photo ?? null },
      goals: entry.statistics?.[0]?.goals?.total ?? 0,
      assists: entry.statistics?.[0]?.goals?.assists ?? 0,
      appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
      rating: entry.statistics?.[0]?.games?.rating ?? null,
      yellowCards: entry.statistics?.[0]?.cards?.yellow ?? 0,
      redCards: entry.statistics?.[0]?.cards?.red ?? 0,
      pos: entry.statistics?.[0]?.games?.position ?? null,
    }))
  }

  const payload: TeamPageData = {
    team, venue, currentSeason: season,
    stats: teamStats, squad: players,
    recentFixtures, standings,
    transfers, trophies, coach, topScorers,
    fetchedAt: Date.now(),
  }
  return NextResponse.json(payload)
}
