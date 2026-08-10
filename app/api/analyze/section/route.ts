import { NextResponse } from "next/server"
import {
  getEvents,
  getFixturePlayerStats,
  getHeadToHead,
  getInjuries,
  getLineups,
  getStandings,
  getStatistics,
  getTeamSeasonStats,
} from "@/lib/api-football"
import type { TeamInfo } from "@/lib/types"

export const dynamic = "force-dynamic"

// Maç panelindeki her sekme kendi verisini, sadece o sekmeye tıklandığında
// bu endpoint üzerinden ayrı ayrı çeker. Böylece panel açılışında tek bir
// /api/analyze isteğiyle 8+ API-Football endpoint'i birden aynı anda
// çekilmiyor; her sekme yalnızca ihtiyacı olan endpoint(ler)i tetikliyor —
// bkz. components/analysis-panel.tsx içindeki useMatchSection hook'u.
const VALID_SECTIONS = [
  "events",
  "playerStats",
  "statistics",
  "lineups",
  "standings",
  "teamStats",
  "h2h",
  "injuries",
] as const
type Section = (typeof VALID_SECTIONS)[number]

function parseTeam(idParam: string | null, nameParam: string | null, logoParam: string | null): TeamInfo | null {
  const id = Number(idParam)
  if (!id || isNaN(id)) return null
  return { id, name: nameParam ?? "", logo: logoParam ?? "" }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))
  const section = searchParams.get("section") as Section | null

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "Geçersiz sekme." }, { status: 400 })
  }

  const homeId = Number(searchParams.get("homeId"))
  const awayId = Number(searchParams.get("awayId"))
  const leagueId = Number(searchParams.get("leagueId"))
  const season = Number(searchParams.get("season"))

  try {
    switch (section) {
      case "events": {
        const data = await getEvents(fixtureId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "playerStats": {
        const data = await getFixturePlayerStats(fixtureId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "statistics": {
        const data = await getStatistics(fixtureId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "lineups": {
        const data = await getLineups(fixtureId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "standings": {
        if (!leagueId || isNaN(leagueId) || !season || isNaN(season)) {
          return NextResponse.json({ data: null })
        }
        const data = await getStandings(leagueId, season, [homeId, awayId].filter((n) => !isNaN(n)))
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "teamStats": {
        const home = parseTeam(searchParams.get("homeId"), searchParams.get("homeName"), searchParams.get("homeLogo"))
        const away = parseTeam(searchParams.get("awayId"), searchParams.get("awayName"), searchParams.get("awayLogo"))
        if (!home || !away || !leagueId || isNaN(leagueId) || !season || isNaN(season)) {
          return NextResponse.json({ data: null })
        }
        const [homeStats, awayStats] = await Promise.all([
          getTeamSeasonStats(home, leagueId, season),
          getTeamSeasonStats(away, leagueId, season),
        ])
        if (!homeStats && !awayStats) return NextResponse.json({ data: null })
        return NextResponse.json({ data: { homeStats, awayStats } })
      }

      case "h2h": {
        if (!homeId || isNaN(homeId) || !awayId || isNaN(awayId)) {
          return NextResponse.json({ data: null })
        }
        const data = await getHeadToHead(homeId, awayId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "injuries": {
        const data = await getInjuries(fixtureId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
