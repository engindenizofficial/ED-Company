import { NextResponse } from "next/server"
import { getLeagueBasicInfo } from "@/lib/api-football"

export const dynamic = "force-dynamic"

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/logo/
// ülke/sezon). Diğer tüm bölümler (puan durumu, gol krallığı, maçlar vb.)
// kendi sekmesine tıklanana kadar hiç istek atmaz — bkz. /api/league/section.
// Not: /lig/[id] dinamik route'u (paylaşılabilir URL) aynı verinin
// server-side karşılığını lib/api-football.ts'deki getLeagueBasicInfo
// üzerinden okur — mantık iki kere yazılmaz.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = Number(searchParams.get("leagueId"))
  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: "missingLeagueId" }, { status: 400 })
  }

  const payload = await getLeagueBasicInfo(leagueId)
  if (!payload) {
    return NextResponse.json({ error: "leagueNotFound" }, { status: 404 })
  }

  return NextResponse.json(payload)
}
