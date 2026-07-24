import { NextResponse } from "next/server"

const BASE_URL = "https://v3.football.api-sports.io"

// Well-known famous players to show by default (API-Football IDs)
const FEATURED_PLAYER_IDS = [
  276,  // Lionel Messi
  874,  // Cristiano Ronaldo
  1100, // Kylian Mbappé
  521,  // Neymar Jr
  686,  // Erling Haaland
  306,  // Mohamed Salah
  745,  // Vinicius Jr
  1485, // Pedri
  306,  // Salah (duplicate removed below)
  2295, // Lamine Yamal
  1325, // Jude Bellingham
  154,  // Antoine Griezmann
  2931, // Phil Foden
  909,  // Harry Kane
  882,  // Robert Lewandowski
  1467, // Bukayo Saka
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
  return json.response ?? []
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""

  try {
    if (q.length >= 3) {
      // Search by name
      const raw = await apiFetch("/players", { search: q, season: 2024 })
      const players = raw.slice(0, 20).map(mapPlayer)
      return NextResponse.json({ players })
    }

    // Return featured players
    const uniqueIds = [...new Set(FEATURED_PLAYER_IDS)]
    const results = await Promise.allSettled(
      uniqueIds.map((id) => apiFetch("/players", { id, season: 2024 }))
    )

    const players = results
      .filter((r) => r.status === "fulfilled" && r.value.length > 0)
      .map((r) => mapPlayer((r as PromiseFulfilledResult<any[]>).value[0]))
      .filter((p) => p !== null)

    return NextResponse.json({ players })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

function mapPlayer(raw: any) {
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
