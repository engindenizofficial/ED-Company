import { NextRequest, NextResponse } from "next/server"
import { calculateAge } from "@/lib/api-football"
import { db } from "@/lib/db"
import { playerMarketValue } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import type { PlayerRole } from "@/lib/games/manager-career"
import { PLAYER_ROLES } from "@/lib/games/manager-career"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// En iyi 20 lig — takım/oyuncu aramasıyla birebir aynı liste.
const TOP_LEAGUE_IDS = [
  39, 140, 135, 78, 61, 203, 2, 3, 848, 88, 94, 144, 179, 197, 207, 235, 253, 262, 71, 128,
]

export interface ManagerPlayerSearchResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamName: string | null
  teamLogo: string | null
  /** Ham API-Football mevki kategorisi. */
  role: PlayerRole
  /** Piyasa değeri, tam euro — kadroya eklerken bütçeden düşülecek tutar. */
  priceEur: number
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

interface RawPlayerHit {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamName: string | null
  teamLogo: string | null
  role: PlayerRole | null
}

async function searchPlayersInLeague(q: string, leagueId: number, season: number): Promise<RawPlayerHit[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const params = new URLSearchParams({ search: q, league: String(leagueId), season: String(season) })

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
      const rawRole = firstStat.games?.position
      const role: PlayerRole | null = PLAYER_ROLES.includes(rawRole) ? rawRole : null
      return {
        id: p.id ?? 0,
        name: p.name ?? "",
        photo: p.photo ?? null,
        nationality: p.nationality ?? null,
        age: calculateAge(p.birth?.date, p.age),
        teamName: firstStat.team?.name ?? null,
        teamLogo: firstStat.team?.logo ?? null,
        role,
      }
    })
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

/**
 * Menajer kariyeri kadro kurma ekranı için oyuncu araması.
 *
 * `/api/players/search`'ten iki farkı var:
 * 1. `role` parametresiyle mevkiye göre filtrelenebilir — bir slota tıklayıp
 *    açılan arama sadece o slotun rolüne uyan oyuncuları göstersin diye.
 * 2. Sonuçlar DB'deki piyasa değeri (matched + valueEur > 0) ile eşleştirilir
 *    ve piyasa değeri OLMAYAN oyuncular tamamen elenir — fiyatı bilinmeyen
 *    bir oyuncu kadroya eklenip bütçeden yanlış (veya hiç) tutar düşülemez.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const roleParam = req.nextUrl.searchParams.get("role")
  const roleFilter: PlayerRole | null = roleParam && PLAYER_ROLES.includes(roleParam as PlayerRole) ? (roleParam as PlayerRole) : null

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = currentSeason()

  const perLeague = await Promise.all(TOP_LEAGUE_IDS.map((leagueId) => searchPlayersInLeague(q, leagueId, season)))

  const qNorm = normalizeTR(q)
  const seen = new Set<number>()
  const candidates: RawPlayerHit[] = []

  for (const leaguePlayers of perLeague) {
    for (const p of leaguePlayers) {
      if (!p.id || seen.has(p.id) || !p.role) continue
      if (roleFilter && p.role !== roleFilter) continue
      const nameNorm = normalizeTR(p.name)
      if (!nameNorm.includes(qNorm)) continue
      seen.add(p.id)
      candidates.push(p)
      if (candidates.length >= 40) break
    }
    if (candidates.length >= 40) break
  }

  if (candidates.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const valueRows = await db
    .select({
      playerId: playerMarketValue.playerId,
      valueEur: playerMarketValue.valueEur,
      matchStatus: playerMarketValue.matchStatus,
    })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.playerId, candidates.map((c) => c.id)))

  const priceMap = new Map<number, number>()
  for (const row of valueRows) {
    if (row.matchStatus === "matched" && row.valueEur !== null && Number(row.valueEur) > 0) {
      priceMap.set(row.playerId, Number(row.valueEur))
    }
  }

  const results: ManagerPlayerSearchResult[] = candidates
    .filter((c) => priceMap.has(c.id))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      photo: c.photo,
      nationality: c.nationality,
      age: c.age,
      teamName: c.teamName,
      teamLogo: c.teamLogo,
      role: c.role as PlayerRole,
      priceEur: priceMap.get(c.id) as number,
    }))

  return NextResponse.json({ results })
}
