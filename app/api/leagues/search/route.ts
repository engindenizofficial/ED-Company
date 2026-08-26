import { NextRequest, NextResponse } from "next/server"
import { FEATURED_LEAGUES, type FeaturedLeague } from "@/lib/leagues"
import { countryMatchesQuery } from "@/lib/tr-aliases"

// Arama kutusunun döndürdüğü şekil, tek kaynak lib/leagues.ts'deki
// FeaturedLeague ile birebir aynı — statik liste, API isteği gerekmez, hızlı.
export type LeagueSearchResult = FeaturedLeague

// Tek kaynaktan türetilir (bkz. lib/leagues.ts). Maç listesi sıralaması ve
// Transfermarkt cron'u da aynı diziden beslenir, bu yüzden yeni bir lig
// eklendiğinde burası ayrıca güncellenmesine gerek kalmadan senkron kalır.
const TOP_LEAGUES: LeagueSearchResult[] = FEATURED_LEAGUES

function normalizeTR(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .trim()
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""

  // Sorgu boşsa tüm ligleri döndür
  if (q.length === 0) {
    return NextResponse.json({ results: TOP_LEAGUES })
  }

  const qNorm = normalizeTR(q)

  const results = TOP_LEAGUES.filter((league) => {
    const nameNorm = normalizeTR(league.name)
    if (nameNorm.includes(qNorm) || countryMatchesQuery(league.country, qNorm)) return true
    if (league.aliases?.some((a) => normalizeTR(a).includes(qNorm))) return true
    return false
  })

  return NextResponse.json({ results })
}
