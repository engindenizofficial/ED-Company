import { NextRequest, NextResponse } from "next/server"
import { calculateAge } from "@/lib/api-football"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"
import { getPlayerMarketValueMapByIds } from "@/lib/search/market-index"
import { normalizeTR } from "@/lib/search/text-normalize"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// Ana sayfadaki 4 sekmeli aramanın "Oyuncular" sekmesi. app/api/players/search
// route'unun ayrı bir kopyası — SADECE 24 öne çıkan lig kapsamında arar
// (bkz. v0_plans/realistic-strategy.md) ve piyasa değerine göre sıralar.
// Eski /api/players/search route'una kasıtlı olarak dokunulmaz.

export interface HomeSearchPlayerResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
  marketValueEur: number
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

interface RawPlayer {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
}

async function searchPlayersInLeague(q: string, leagueId: number, season: number): Promise<RawPlayer[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const params = new URLSearchParams({
    search: q,
    league: String(leagueId),
    season: String(season),
  })

  try {
    const res = await fetch(`${BASE_URL}/players?${params}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    const entries: any[] = json.response ?? []

    return entries.map((entry) => {
      const p = entry.player ?? {}
      const firstStat = entry.statistics?.[0] ?? {}
      return {
        id: p.id ?? 0,
        name: p.name ?? "",
        photo: p.photo ?? null,
        nationality: p.nationality ?? null,
        age: calculateAge(p.birth?.date, p.age),
        teamId: firstStat.team?.id ?? null,
        teamName: firstStat.team?.name ?? null,
        teamLogo: firstStat.team?.logo ?? null,
      }
    })
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = currentSeason()

  const perLeague = await Promise.all(
    FEATURED_LEAGUE_IDS.map((leagueId) => searchPlayersInLeague(q, leagueId, season)),
  )

  const qNorm = normalizeTR(q)
  const seen = new Set<number>()
  const matched: RawPlayer[] = []

  for (const leaguePlayers of perLeague) {
    for (const p of leaguePlayers) {
      if (!p.id || seen.has(p.id)) continue
      if (!normalizeTR(p.name).includes(qNorm)) continue
      seen.add(p.id)
      matched.push(p)
    }
  }

  const valueMap = await getPlayerMarketValueMapByIds(matched.map((p) => p.id))

  const results: HomeSearchPlayerResult[] = matched
    .map((p) => ({ ...p, marketValueEur: valueMap.get(p.id) ?? 0 }))
    .sort((a, b) => {
      if (b.marketValueEur !== a.marketValueEur) return b.marketValueEur - a.marketValueEur
      return a.name.localeCompare(b.name, "tr")
    })
    .slice(0, 20)

  return NextResponse.json({ results })
}
