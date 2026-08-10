import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type { LeagueBasicInfo } from "@/lib/types"

export const dynamic = "force-dynamic"

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/logo/
// ülke/sezon). Diğer tüm bölümler (puan durumu, gol krallığı, maçlar vb.)
// kendi sekmesine tıklanana kadar hiç istek atmaz — bkz. /api/league/section.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = Number(searchParams.get("leagueId"))
  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: "leagueId gerekli." }, { status: 400 })
  }

  const season = currentSeason()
  const leagueRaw = await apiFetch<any>("/leagues", { id: leagueId, season })
  if (!leagueRaw || leagueRaw.length === 0) {
    return NextResponse.json({ error: "Lig bulunamadı." }, { status: 404 })
  }

  const rawLeague = leagueRaw[0]
  const payload: LeagueBasicInfo = {
    league: {
      id: rawLeague.league?.id ?? leagueId,
      name: rawLeague.league?.name ?? "",
      country: toTurkishCountry(rawLeague.country?.name ?? ""),
      logo: rawLeague.league?.logo ?? "",
      flagUrl: rawLeague.country?.flag ?? null,
    },
    season,
  }
  return NextResponse.json(payload)
}
