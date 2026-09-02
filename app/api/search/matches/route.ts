import { NextRequest, NextResponse } from "next/server"
import { getFixturesResponse } from "@/lib/fixtures-server"
import { getTeamMarketValueMapByTeamIds } from "@/lib/search/market-index"
import { normalizeTR } from "@/lib/search/text-normalize"
import { countryMatchesQuery } from "@/lib/tr-aliases"
import type { Fixture } from "@/lib/types"
import { normalizeTimeZone, SERVER_TIME_ZONE } from "@/lib/fixture-datetime"

export const dynamic = "force-dynamic"

// Ana sayfadaki 4 sekmeli aramanın "Maçlar" sekmesi. NOT 2 gereksinimi: bu
// sekme 24 öne çıkan lig ile SINIRLI DEĞİL — seçili günün TÜM maçları
// arasından (dünya çapında) filtreleme yapar. Sıralama, ev+deplasman takımı
// piyasa değeri toplamına göredir (kayıt yoksa 0 kabul edilir).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? ""
  const timeZone = normalizeTimeZone(req.nextUrl.searchParams.get("timeZone"), SERVER_TIME_ZONE)

  if (q.length < 2 || !date) {
    return NextResponse.json({ results: [] })
  }

  const { fixtures } = await getFixturesResponse(date, false, timeZone)

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

  const teamIds = new Set<number>()
  for (const f of matched) {
    teamIds.add(f.home.id)
    teamIds.add(f.away.id)
  }

  const valueMap = await getTeamMarketValueMapByTeamIds([...teamIds])

  const scored = matched.map((f) => {
    const homeValue = valueMap.get(f.home.id) ?? 0
    const awayValue = valueMap.get(f.away.id) ?? 0
    return { fixture: f, score: homeValue + awayValue }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.fixture.timestamp - b.fixture.timestamp
  })

  const results: Fixture[] = scored.slice(0, 20).map((s) => s.fixture)

  return NextResponse.json({ results })
}
