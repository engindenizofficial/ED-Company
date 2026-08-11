import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getPlayerMarketValue } from "@/lib/market-values"
import type { PlayerProfile } from "@/lib/types"

export const dynamic = "force-dynamic"

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// Panel açıldığında sadece bu hafif endpoint çağrılır (header için isim/foto/
// yaş/pozisyon/mevcut takım). Diğer tüm bölümler (sezon istatistikleri, kariyer
// özeti, kupalar, transferler, sakatlık geçmişi) kendi sekmesine tıklanana
// kadar hiç istek atmaz — bkz. /api/player/section.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get("playerId"))
  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "playerId gerekli." }, { status: 400 })
  }

  const season = currentSeason()
  const playerRaw = await apiFetch<any>("/players", { id: playerId, season })
  if (!playerRaw || playerRaw.length === 0) {
    return NextResponse.json({ error: "Oyuncu bulunamadı." }, { status: 404 })
  }

  const entry = playerRaw[0]
  const p = entry.player ?? {}
  const currentStats = entry.statistics?.[0] ?? {}

  // Piyasa değeri veritabanından okunur (cron tarafından haftalık dolduruluyor);
  // burada asla canlı scrape tetiklenmez, sadece mevcut kaydı okunur.
  const marketValue = p.id ? await getPlayerMarketValue(p.id).catch(() => null) : null

  const profile: PlayerProfile = {
    id: p.id ?? 0,
    name: p.name ?? "",
    firstname: p.firstname ?? "",
    lastname: p.lastname ?? "",
    age: p.age ?? null,
    birthDate: p.birth?.date ?? null,
    birthPlace: p.birth?.place ?? null,
    birthCountry: p.birth?.country ?? null,
    nationality: p.nationality ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    photo: p.photo ?? null,
    position: currentStats.games?.position ?? null,
    number: currentStats.games?.number ?? null,
    injured: p.injured ?? false,
    team: currentStats.team
      ? { id: currentStats.team.id, name: currentStats.team.name, logo: currentStats.team.logo ?? "" }
      : null,
    league: currentStats.league
      ? {
          id: currentStats.league.id,
          name: currentStats.league.name,
          country: toTurkishCountry(currentStats.league.country),
          logo: currentStats.league.logo ?? "",
          season: currentStats.league.season,
        }
      : null,
    marketValueEur: marketValue?.matchStatus === "matched" ? marketValue.valueEur : null,
  }

  return NextResponse.json(profile)
}
