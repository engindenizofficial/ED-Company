import { NextRequest, NextResponse } from "next/server"
import { getFixturesResponse } from "@/lib/fixtures-server"
import { normalizeTR } from "@/lib/search/text-normalize"
import { countryMatchesQuery } from "@/lib/tr-aliases"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"

// Ana sayfadaki 4 sekmeli aramanın "Maçlar" sekmesi. NOT 2 gereksinimi: bu
// sekme 24 öne çıkan lig ile SINIRLI DEĞİL — seçili günün TÜM maçları
// arasından (dünya çapında) filtreleme yapar. Sıralama, ev+deplasman takımı
// piyasa değeri toplamına göredir (kayıt yoksa 0 kabul edilir).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? ""

  if (q.length < 2 || !date) {
    return NextResponse.json({ results: [] })
  }

  const { fixtures } = await getFixturesResponse(date)

  const qNorm = normalizeTR(q)
  const matched = fixtures.filter((f) => {
    return (
      normalizeTR(f.league.name).includes(qNorm) ||
      countryMatchesQuery(f.league.country, qNorm) ||
      normalizeTR(f.home.name).includes(qNorm) ||
      normalizeTR(f.away.name).includes(qNorm)
    )
  })

  if (matched.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const results: Fixture[] = matched
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 20)

  return NextResponse.json({ results })
}
