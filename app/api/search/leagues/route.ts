import { NextRequest, NextResponse } from "next/server"
import { FEATURED_LEAGUES } from "@/lib/leagues"
import { getFeaturedLeagueMarketValueMap } from "@/lib/search/market-index"
import { normalizeTR } from "@/lib/search/text-normalize"
import { toTurkishCountry } from "@/lib/tr-aliases"

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
    (l) => normalizeTR(l.name).includes(qNorm) || normalizeTR(l.country).includes(qNorm),
  )

  if (matched.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const valueMap = await getFeaturedLeagueMarketValueMap()

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
