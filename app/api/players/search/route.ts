import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// Top 20 lig (takım aramasıyla aynı liste)
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

const LEAGUE_IDS = [...new Set(TOP_LEAGUE_IDS)]

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

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 86400 }, // 24 saat Next.js cache — takım aramasıyla aynı strateji
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as T[]) ?? []
  } catch {
    return []
  }
}

// Türkçe normalize
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

  // Tüm liglerin kadrolarını paralel çek — Next.js 24 saat cache
  const squadsPerLeague = await Promise.all(
    LEAGUE_IDS.map((leagueId) =>
      apiFetch<any>("/players/squads", { league: leagueId, season })
    )
  )

  const qNorm = normalizeTR(q)
  const seen = new Set<number>()
  const results: PlayerSearchResult[] = []

  for (const leagueSquads of squadsPerLeague) {
    for (const entry of leagueSquads) {
      const team = entry.team ?? {}
      for (const p of entry.players ?? []) {
        if (!p.id || seen.has(p.id)) continue
        const nameNorm = normalizeTR(p.name ?? "")
        if (!nameNorm.includes(qNorm)) continue
        seen.add(p.id)
        results.push({
          id: p.id,
          name: p.name ?? "",
          photo: p.photo ?? null,
          nationality: p.nationality ?? null,
          age: p.age ?? null,
          teamId: team.id ?? null,
          teamName: team.name ?? null,
          teamLogo: team.logo ?? null,
        })
        if (results.length >= 20) break
      }
      if (results.length >= 20) break
    }
    if (results.length >= 20) break
  }

  return NextResponse.json({ results })
}
