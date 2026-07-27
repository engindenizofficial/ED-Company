import { NextResponse } from "next/server"
import { getCachedTopPlayers, setCachedTopPlayers } from "@/lib/redis"
import type { PlayerSummary } from "@/lib/types"

const BASE_URL = "https://v3.football.api-sports.io"
const SEASON = 2026

// Top 20 leagues by global popularity (API-Football league IDs)
const TOP_20_LEAGUES = [
  39,   // Premier League (England)
  140,  // La Liga (Spain)
  135,  // Serie A (Italy)
  78,   // Bundesliga (Germany)
  61,   // Ligue 1 (France)
  203,  // Süper Lig (Turkey)
  88,   // Eredivisie (Netherlands)
  94,   // Primeira Liga (Portugal)
  179,  // Scottish Premiership
  144,  // Jupiler Pro League (Belgium)
  98,   // J1 League (Japan)
  307,  // Saudi Pro League
  253,  // MLS (USA)
  128,  // Liga Profesional (Argentina)
  71,   // Brasileirão Série A (Brazil)
  169,  // Super Lig (Switzerland)
  106,  // Ekstraklasa (Poland)
  235,  // Russian Premier League
  218,  // Bundesliga (Austria)
  197,  // Super League (Greece)
]

async function apiFetch(path: string, params: Record<string, string | number>) {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error("API_FOOTBALL_KEY tanımlı değil")
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const res = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`API-Football hata (${res.status})`)
  const json = await res.json()
  if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
    throw new Error(Object.values(json.errors).join(" "))
  }
  return json.response ?? []
}

function mapPlayer(raw: any): PlayerSummary | null {
  if (!raw?.player) return null
  const p = raw.player
  const stat = raw.statistics?.[0]
  return {
    id: p.id,
    name: p.name,
    photo: p.photo ?? null,
    nationality: p.nationality ?? null,
    age: p.age ?? null,
    position: stat?.games?.position ?? null,
    team: stat?.team ? { id: stat.team.id, name: stat.team.name, logo: stat.team.logo } : null,
    league: stat?.league ? { id: stat.league.id, name: stat.league.name, logo: stat.league.logo } : null,
    goals: stat?.goals?.total ?? null,
    assists: stat?.goals?.assists ?? null,
    rating: stat?.games?.rating ?? null,
  }
}

async function fetchTopPlayersForLeague(leagueId: number): Promise<PlayerSummary[]> {
  try {
    const raw = await apiFetch("/players/topscorers", { league: leagueId, season: SEASON })
    return (raw as any[])
      .map(mapPlayer)
      .filter((p): p is PlayerSummary => p !== null)
      .slice(0, 20)
  } catch {
    return []
  }
}

async function buildTopPlayersList(): Promise<PlayerSummary[]> {
  // Fetch top scorers from all 20 leagues in parallel (batched to avoid rate limits)
  const BATCH_SIZE = 5
  const allPlayers: PlayerSummary[] = []
  const seen = new Set<number>()

  for (let i = 0; i < TOP_20_LEAGUES.length; i += BATCH_SIZE) {
    const batch = TOP_20_LEAGUES.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(fetchTopPlayersForLeague))
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const p of result.value) {
          if (!seen.has(p.id)) {
            seen.add(p.id)
            allPlayers.push(p)
          }
        }
      }
    }
  }

  // Sort by goals desc, then by rating desc
  allPlayers.sort((a, b) => {
    const goalsDiff = (b.goals ?? 0) - (a.goals ?? 0)
    if (goalsDiff !== 0) return goalsDiff
    return parseFloat(b.rating ?? "0") - parseFloat(a.rating ?? "0")
  })

  return allPlayers
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const PAGE_SIZE = 40

  try {
    if (q.length >= 3) {
      // Live search by name — always fresh from API
      const raw = await apiFetch("/players", { search: q, season: SEASON })
      const players = (raw as any[]).slice(0, 30).map(mapPlayer).filter((p): p is PlayerSummary => p !== null)
      return NextResponse.json({ players, total: players.length, page: 1, pageSize: players.length })
    }

    // Default: return top players from all 20 leagues, paginated
    let players = await getCachedTopPlayers(SEASON)

    if (!players) {
      players = await buildTopPlayersList()
      if (players.length > 0) {
        await setCachedTopPlayers(SEASON, players)
      }
    }

    const total = players.length
    const start = (page - 1) * PAGE_SIZE
    const paginated = players.slice(start, start + PAGE_SIZE)

    return NextResponse.json({ players: paginated, total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Hata" },
      { status: 500 }
    )
  }
}
