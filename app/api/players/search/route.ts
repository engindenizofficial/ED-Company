import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

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

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 },
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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1

  const raw = await apiFetch<any>("/players", { search: q, season })

  const qNorm = normalizeTR(q)
  const results: PlayerSearchResult[] = raw
    .filter((entry: any) => {
      const name = normalizeTR(entry?.player?.name ?? "")
      return name.includes(qNorm)
    })
    .slice(0, 20)
    .map((entry: any) => {
      const p = entry.player ?? {}
      const stats = entry.statistics?.[0] ?? {}
      return {
        id: p.id ?? 0,
        name: p.name ?? "",
        photo: p.photo ?? null,
        nationality: p.nationality ?? null,
        age: p.age ?? null,
        teamId: stats.team?.id ?? null,
        teamName: stats.team?.name ?? null,
        teamLogo: stats.team?.logo ?? null,
      }
    })

  return NextResponse.json({ results })
}
