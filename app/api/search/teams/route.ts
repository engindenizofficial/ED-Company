import { NextRequest, NextResponse } from "next/server"
import { getFeaturedTeamsDirectory, type FeaturedTeamEntry } from "@/lib/search/team-directory"
import { normalizeTR } from "@/lib/search/text-normalize"

export const dynamic = "force-dynamic"

// Ana sayfadaki 4 sekmeli aramanın "Takımlar" sekmesi. SADECE 24 öne çıkan
// lige ait takımlar kapsamındadır (getFeaturedTeamDirectory), piyasa
// değerine göre sıralanır (kayıt yoksa 0 kabul edilir). Eski
// app/api/teams/search route'una kasıtlı olarak dokunulmaz.

export interface HomeSearchTeamResult {
  id: number
  name: string
  logo: string
  country: string
  leagueId: number
  leagueName: string
  leagueLogo: string
  marketValueEur: number
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const directory = await getFeaturedTeamsDirectory()
  const qNorm = normalizeTR(q)

  const matched = directory.filter((t: FeaturedTeamEntry) => normalizeTR(t.name).includes(qNorm))
  if (matched.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const results: HomeSearchTeamResult[] = matched
    .map((t: FeaturedTeamEntry) => ({
      id: t.id,
      name: t.name,
      logo: t.logo,
      country: t.country,
      leagueId: t.leagueId,
      leagueName: t.leagueName,
      leagueLogo: t.leagueLogo,
      marketValueEur: 0,
    }))
    .sort((a: HomeSearchTeamResult, b: HomeSearchTeamResult) => a.name.localeCompare(b.name, "tr"))
    .slice(0, 20)

  return NextResponse.json({ results })
}
