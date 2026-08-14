import { NextResponse } from "next/server"
import { getPlayerBasicProfile } from "@/lib/api-football"

export const dynamic = "force-dynamic"

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/foto/
// yaş/pozisyon/mevcut takım). Diğer tüm bölümler (sezon istatistikleri, kariyer
// özeti, kupalar, transferler, sakatlık geçmişi) kendi sekmesine tıklanana
// kadar hiç istek atmaz — bkz. /api/player/section.
// Not: /oyuncu/[id] dinamik route'u (paylaşılabilir URL) aynı verinin
// server-side karşılığını lib/api-football.ts'deki getPlayerBasicProfile
// üzerinden okur — mantık iki kere yazılmaz.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get("playerId"))
  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "missingPlayerId" }, { status: 400 })
  }

  const profile = await getPlayerBasicProfile(playerId)
  if (!profile) {
    return NextResponse.json({ error: "playerNotFound" }, { status: 404 })
  }

  return NextResponse.json(profile)
}
