import { NextRequest, NextResponse } from "next/server"
import { redis } from "@/lib/redis"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// Top 20 ligler (en yaygın) — aynı takım aramasındaki strateji
const TOP_LEAGUE_IDS = [
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  94,  // Primeira Liga
  88,  // Eredivisie
  144, // Jupiler Pro League
  203, // Süper Lig
  179, // Scottish Premiership
  197, // Super League Greece
  218, // Saudi Pro League
  253, // MLS
  128, // Liga Profesional Argentina
  71,  // Brasileirao
  262, // Liga MX
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Conference League
  1,   // World Cup
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

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as T[]) ?? []
  } catch {
    return []
  }
}

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

// Tüm top-20 lig kadrolarını Redis'te önbelleğe alır; cache miss durumunda API'den çeker.
async function getAllPlayersIndex(season: number): Promise<PlayerSearchResult[]> {
  const cacheKey = `players:index:${season}`

  // Redis cache hit
  try {
    const cached = await redis.get<PlayerSearchResult[]>(cacheKey)
    if (cached && cached.length > 0) return cached
  } catch {
    // Redis erişilemiyorsa devam et
  }

  // API'den paralel çek — her lig için kadro
  const squads = await Promise.all(
    TOP_LEAGUE_IDS.map((leagueId) =>
      apiFetch<any>("/players/squads", { league: leagueId, season })
    )
  )

  const seen = new Set<number>()
  const players: PlayerSearchResult[] = []

  for (const leagueSquads of squads) {
    for (const entry of leagueSquads) {
      const team = entry.team ?? {}
      for (const p of entry.players ?? []) {
        if (!p.id || seen.has(p.id)) continue
        seen.add(p.id)
        players.push({
          id: p.id,
          name: p.name ?? "",
          photo: p.photo ?? null,
          nationality: p.nationality ?? null,
          age: p.age ?? null,
          teamId: team.id ?? null,
          teamName: team.name ?? null,
          teamLogo: team.logo ?? null,
        })
      }
    }
  }

  // 24 saat cache
  if (players.length > 0) {
    try {
      await redis.set(cacheKey, players, { ex: 86400 })
    } catch {
      // sessizce geç
    }
  }

  return players
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = currentSeason()
  const allPlayers = await getAllPlayersIndex(season)

  const qNorm = normalizeTR(q)
  const results = allPlayers
    .filter((p) => normalizeTR(p.name).includes(qNorm))
    .slice(0, 20)

  return NextResponse.json({ results })
}
