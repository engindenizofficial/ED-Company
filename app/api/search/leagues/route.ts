import { NextRequest, NextResponse } from "next/server"
import { FEATURED_LEAGUES } from "@/lib/leagues"
import { getLeagueMarketValueMapByTeamMemberships } from "@/lib/search/market-index"
import { getFeaturedTeamsDirectory } from "@/lib/search/team-directory"
import { normalizeTR } from "@/lib/search/text-normalize"
import { countryMatchesQuery, toTurkishCountry } from "@/lib/tr-aliases"

export const dynamic = "force-dynamic"

// Ana sayfadaki 4 sekmeli aramanın "Ligler" sekmesi. SADECE 24 öne çıkan lig
// kapsamındadır (FEATURED_LEAGUES), ligdeki tüm takımların toplam kadro
// piyasa değerine göre sıralanır (kayıt yoksa 0 kabul edilir). Eski
// app/api/leagues/search route'una kasıtlı olarak dokunulmaz.

export interface HomeSearchLeagueResult {
  id: number
  name: string
  logo: string
  country: string
  flagUrl: string
  marketValueEur: number
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const qNorm = normalizeTR(q)
  const matched = FEATURED_LEAGUES.filter(
    (l) => normalizeTR(l.name).includes(qNorm) || countryMatchesQuery(l.country, qNorm),
  )

  if (matched.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const teams = await getFeaturedTeamsDirectory()
  const memberships = new Map<number, number[]>()
  for (const team of teams) {
    for (const leagueId of team.leagueIds ?? [team.leagueId]) {
      const teamIds = memberships.get(leagueId) ?? []
      teamIds.push(team.id)
      memberships.set(leagueId, teamIds)
    }
  }
  const valueMap = await getLeagueMarketValueMapByTeamMemberships(memberships)

  const results: HomeSearchLeagueResult[] = matched
    .map((l) => ({
      id: l.id,
      name: l.name,
      logo: l.logo,
      country: toTurkishCountry(l.country),
      flagUrl: l.flagUrl,
      marketValueEur: valueMap.get(l.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.marketValueEur !== a.marketValueEur) return b.marketValueEur - a.marketValueEur
      return a.name.localeCompare(b.name, "tr")
    })
    .slice(0, 20)

  return NextResponse.json({ results })
}
