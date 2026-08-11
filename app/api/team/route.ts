import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { getTeamMarketValue } from "@/lib/market-values"
import type { TeamBasicInfo, TeamInfo } from "@/lib/types"

export const dynamic = "force-dynamic"

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/logo/stadyum).
// Diğer tüm bölümler (istatistik, kadro, transferler vb.) kendi sekmesine
// tıklanana kadar hiç istek atmaz — bkz. /api/team/section.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamId = Number(searchParams.get("teamId"))
  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "teamId gerekli." }, { status: 400 })
  }

  const teamRaw = await apiFetch<any>("/teams", { id: teamId })
  if (!teamRaw || teamRaw.length === 0) {
    return NextResponse.json({ error: "Takım bulunamadı." }, { status: 404 })
  }

  const rawTeam = teamRaw[0]
  const team: TeamInfo = { id: rawTeam.team.id, name: rawTeam.team.name, logo: rawTeam.team.logo }

  // Piyasa değeri veritabanından okunur (cron tarafından haftalık dolduruluyor);
  // burada asla canlı scrape tetiklenmez, sadece mevcut kaydı okunur.
  const marketValue = await getTeamMarketValue(teamId).catch(() => null)

  const payload: TeamBasicInfo = {
    team,
    venue: {
      name: rawTeam.venue?.name ?? null,
      city: rawTeam.venue?.city ?? null,
      capacity: rawTeam.venue?.capacity ?? null,
      image: rawTeam.venue?.image ?? null,
    },
    currentSeason: currentSeason(),
    marketValueEur: marketValue?.matchStatus === "matched" ? marketValue.totalValueEur : null,
  }
  return NextResponse.json(payload)
}
