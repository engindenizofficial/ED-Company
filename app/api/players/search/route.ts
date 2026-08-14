import { NextRequest, NextResponse } from "next/server"
import { calculateAge } from "@/lib/api-football"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// En iyi 20 lig — takım aramasıyla birebir aynı liste
const TOP_LEAGUE_IDS = [
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  203, // Süper Lig
  2,   // Champions League
  3,   // Europa League
  848, // Conference League
  88,  // Eredivisie
  94,  // Primeira Liga
  144, // Jupiler Pro League
  179, // Scottish Premiership
  197, // Super League (Yunanistan)
  207, // Super League (İsviçre)
  235, // Premier Liga (Rusya)
  253, // MLS
  262, // Liga MX
  71,  // Série A (Brezilya)
  128, // Liga Profesional (Arjantin)
]

export interface PlayerSearchResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

/**
 * Bir lig için oyuncu araması yapar.
 * /players?search=NAME&league=ID&season=YEAR — API-Football'un doğru arama endpoint'i.
 * next.revalidate ile 1 saat önbelleğe alınır.
 */
async function searchPlayersInLeague(
  q: string,
  leagueId: number,
  season: number,
): Promise<PlayerSearchResult[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const params = new URLSearchParams({
    search: q,
    league: String(leagueId),
    season: String(season),
  })

  try {
    const res = await fetch(`${BASE_URL}/players?${params}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    const entries: any[] = json.response ?? []

    return entries.map((entry) => {
      const p = entry.player ?? {}
      const firstStat = entry.statistics?.[0] ?? {}
      return {
        id: p.id ?? 0,
        name: p.name ?? "",
        photo: p.photo ?? null,
        nationality: p.nationality ?? null,
        age: calculateAge(p.birth?.date, p.age),
        teamId: firstStat.team?.id ?? null,
        teamName: firstStat.team?.name ?? null,
        teamLogo: firstStat.team?.logo ?? null,
      }
    })
  } catch {
    return []
  }
}

// Türkçe normalize: ş→s, ç→c, ğ→g, ü→u, ö→o, ı→i
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
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = currentSeason()

  // Tüm ligleri paralel sorgula — her biri kendi Next.js önbelleğiyle çalışır
  const perLeague = await Promise.all(
    TOP_LEAGUE_IDS.map((leagueId) => searchPlayersInLeague(q, leagueId, season))
  )

  // Deduplikasyon ve Türkçe normalize filtreleme
  const qNorm = normalizeTR(q)
  const seen = new Set<number>()
  const results: PlayerSearchResult[] = []

  for (const leaguePlayers of perLeague) {
    for (const p of leaguePlayers) {
      if (!p.id || seen.has(p.id)) continue
      const nameNorm = normalizeTR(p.name)
      if (!nameNorm.includes(qNorm)) continue
      seen.add(p.id)
      results.push(p)
      if (results.length >= 20) break
    }
    if (results.length >= 20) break
  }

  return NextResponse.json({ results })
}
