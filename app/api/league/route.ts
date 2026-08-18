import { NextResponse } from "next/server"
import { getLeagueBasicInfo } from "@/lib/api-football"

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStoreJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

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
    return noStoreJson({ error: "missingLeagueId" }, { status: 400 })
  }

  const payload = await getLeagueBasicInfo(leagueId)
  if (!payload) {
    return noStoreJson({ error: "leagueNotFound" }, { status: 404 })
  }

  return noStoreJson(payload)
}
