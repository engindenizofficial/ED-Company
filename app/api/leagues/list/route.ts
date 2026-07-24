import { NextResponse } from "next/server"
import { FEATURED_LEAGUES } from "@/lib/api-football"

const BASE_URL = "https://v3.football.api-sports.io"

async function apiFetch(path: string, params: Record<string, string | number>) {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error("API_FOOTBALL_KEY tanımlı değil")
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const res = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate: 86400 },
  })
  if (!res.ok) throw new Error(`API-Football hata (${res.status})`)
  const json = await res.json()
  return json.response ?? []
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""

  try {
    if (q.length >= 2) {
      // Search by name
      const raw = await apiFetch("/leagues", { search: q })
      const leagues = raw
        .slice(0, 20)
        .map(mapLeague)
        .filter((l: any) => l !== null)
      return NextResponse.json({ leagues })
    }

    // Return featured leagues
    const results = await Promise.allSettled(
      FEATURED_LEAGUES.map((id) => apiFetch("/leagues", { id, current: "true" }))
    )

    const leagues = results
      .filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<any[]>).value.length > 0)
      .map((r) => mapLeague((r as PromiseFulfilledResult<any[]>).value[0]))
      .filter((l) => l !== null)

    return NextResponse.json({ leagues })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

function mapLeague(raw: any) {
  if (!raw?.league) return null
  const season = raw.seasons?.find((s: any) => s.current) ?? raw.seasons?.[raw.seasons.length - 1]
  return {
    id: raw.league.id,
    name: raw.league.name,
    logo: raw.league.logo ?? null,
    country: raw.country?.name ?? "",
    countryFlag: raw.country?.flag ?? null,
    season: season?.year ?? null,
    type: raw.league.type ?? null,
  }
}
