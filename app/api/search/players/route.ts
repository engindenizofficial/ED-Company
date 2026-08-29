import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { playerMarketValue, teamMarketValue } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"
import { getSquad } from "@/lib/api-football"
import { normalizeTR } from "@/lib/search/text-normalize"

export const dynamic = "force-dynamic"

// Ana sayfadaki oyuncu araması yerel piyasa değeri tablosunu kullanır.
// Böylece API-Football'ın en az 4 karakter isteyen arama sınırına takılmaz ve
// yeni veri sağlayıcısının doldurduğu adlarla 2 karakterden itibaren çalışır.

export interface HomeSearchPlayerResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
  marketValueEur: number
}

interface CandidateRow {
  playerId: number
  playerName: string
  fullName: string | null
  teamId: number
  teamName: string | null
  valueEur: number
}

let candidateCache: { rows: CandidateRow[]; fetchedAt: number } | null = null
const CANDIDATE_CACHE_TTL_MS = 2 * 60 * 1000

async function getCandidateRows(): Promise<CandidateRow[]> {
  if (candidateCache && Date.now() - candidateCache.fetchedAt < CANDIDATE_CACHE_TTL_MS) {
    return candidateCache.rows
  }

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      fullName: playerMarketValue.fullName,
      teamId: playerMarketValue.teamId,
      teamName: teamMarketValue.teamName,
      leagueId: teamMarketValue.leagueId,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerMarketValue)
    .innerJoin(teamMarketValue, eq(teamMarketValue.teamId, playerMarketValue.teamId))
    .where(inArray(teamMarketValue.leagueId, FEATURED_LEAGUE_IDS))

  const parsed: CandidateRow[] = rows.map((r) => ({
    playerId: r.playerId,
    playerName: r.playerName,
    fullName: r.fullName,
    teamId: r.teamId,
    teamName: r.teamName,
    valueEur: r.valueEur !== null ? Number(r.valueEur) : 0,
  }))

  candidateCache = { rows: parsed, fetchedAt: Date.now() }
  return parsed
}

/** API-Football takım logosu — sabit URL şablonu, ekstra istek gerektirmez. */
function teamLogoUrl(teamId: number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`
}

/** Aynı anda en fazla `size` kadar öğeyi işler — API-Football'a ani istek yığını göndermemek için. */
async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const qNorm = normalizeTR(q)
  const allCandidates = await getCandidateRows()

  // Kısa ad ("O. Dembélé") VE tam ad ("Ousmane Dembélé") birleştirilip aranır.
  const searchableOf = (c: CandidateRow) => normalizeTR(`${c.fullName ?? ""} ${c.playerName}`)

  const matches = allCandidates
    .filter((c) => searchableOf(c).includes(qNorm))
    .sort((a, b) => b.valueEur - a.valueEur)
    .slice(0, 20)

  if (matches.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Fotoğraf/yaş/uyruk DB'de yok — eşleşen adayların takımlarına, takım
  // başına BİR KEZ /players/squads isteği atılır (1 saat cache'li).
  const uniqueTeamIds = Array.from(new Set(matches.map((m) => m.teamId)))
  const squadEntries = await mapWithConcurrency(uniqueTeamIds, 4, async (teamId) => {
    try {
      return [teamId, await getSquad(teamId)] as const
    } catch {
      return [teamId, []] as const
    }
  })

  const infoByPlayerId = new Map<number, { photo: string | null; age: number | null }>()
  for (const [, squad] of squadEntries) {
    for (const sp of squad) {
      infoByPlayerId.set(sp.id, { photo: sp.photo, age: sp.age })
    }
  }

  const results: HomeSearchPlayerResult[] = matches.map((c) => {
    const info = infoByPlayerId.get(c.playerId)
    return {
      id: c.playerId,
      name: c.playerName,
      photo: info?.photo ?? null,
      nationality: null,
      age: info?.age ?? null,
      teamId: c.teamId,
      teamName: c.teamName,
      teamLogo: teamLogoUrl(c.teamId),
      marketValueEur: c.valueEur,
    }
  })

  return NextResponse.json({ results })
}
