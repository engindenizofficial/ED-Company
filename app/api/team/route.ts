import { NextResponse } from "next/server"
import { getTeamBasicInfo } from "@/lib/api-football"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/logo/stadyum).
// Diğer tüm bölümler (istatistik, kadro, transferler vb.) kendi sekmesine
// tıklanana kadar hiç istek atmaz — bkz. /api/team/section.
// Not: /takim/[id] dinamik route'u (paylaşılabilir URL) aynı verinin
// server-side karşılığını lib/api-football.ts'deki getTeamBasicInfo
// üzerinden okur — mantık iki kere yazılmaz.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamId = Number(searchParams.get("teamId"))
  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "missingTeamId" }, { status: 400 })
  }

  const payload = await getTeamBasicInfo(teamId)
  if (!payload) {
    return NextResponse.json({ error: "teamNotFound" }, { status: 404 })
  }

  return NextResponse.json(payload)
}
