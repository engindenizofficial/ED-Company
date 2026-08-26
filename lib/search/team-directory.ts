// ---------------------------------------------------------------------------
// SADECE 24 öne çıkan lige (lib/leagues.ts -> FEATURED_LEAGUES) ait takımların
// dizini. app/api/teams/search/route.ts'teki fetchAllTeams mantığının
// genellenmiş hali — o route KENDİ kopyasını kullanmayı sürdürür (favoriler
// akışını bozmamak için, bkz. v0_plans/deep-solution.md), bu modül yalnızca
// yeni /api/search/* uçları tarafından kullanılır.
// ---------------------------------------------------------------------------
import { redis } from "@/lib/redis"
import { FEATURED_LEAGUES, FEATURED_LEAGUE_IDS } from "@/lib/leagues"
import { toTurkishCountry } from "@/lib/tr-aliases"

const BASE_URL = "https://v3.football.api-sports.io"
const BATCH_SIZE = 4
const BATCH_DELAY_MS = 1200 // API-Football rate limit: ~30 req/min

export interface FeaturedTeamEntry {
  id: number
  name: string
  logo: string
  country: string
  leagueId: number
  leagueName: string
  leagueLogo: string
}

interface RawTeam {
  team: {
    id: number
    name: string
    logo: string
    national: boolean
    country: string
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Türkiye saatiyle gece yarısına kadar kalan saniye. */
function secondsUntilMidnightTR(): number {
  const now = new Date()
  const todayTR = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
  const midnight = new Date(`${todayTR}T00:00:00+03:00`)
  midnight.setDate(midnight.getDate() + 1)
  return Math.max(60, Math.floor((midnight.getTime() - now.getTime()) / 1000))
}

async function apiFetch(path: string, params: Record<string, string | number>): Promise<RawTeam[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))

  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: secondsUntilMidnightTR() },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as RawTeam[]) ?? []
  } catch {
    return []
  }
}

async function fetchFeaturedTeams(season: number): Promise<FeaturedTeamEntry[]> {
  const allLeagueResults: { leagueId: number; teams: RawTeam[] }[] = []

  for (let i = 0; i < FEATURED_LEAGUE_IDS.length; i += BATCH_SIZE) {
    const batch = FEATURED_LEAGUE_IDS.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (leagueId) => {
        let raw = await apiFetch("/teams", { league: leagueId, season })
        if (raw.length === 0) {
          raw = await apiFetch("/teams", { league: leagueId, season: season - 1 })
        }
        return { leagueId, teams: raw }
      }),
    )
    allLeagueResults.push(...batchResults)
    if (i + BATCH_SIZE < FEATURED_LEAGUE_IDS.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  const leagueMeta = new Map(FEATURED_LEAGUES.map((l) => [l.id, l]))
  const seen = new Set<number>()
  const all: FeaturedTeamEntry[] = []

  // ÖNEMLI: Etiketleme sırasında ulusal ligler Avrupa kupalarından ÖNCE
  // işlenmeli. FEATURED_LEAGUES dizisinde kupalar (Şampiyonlar Ligi vb.)
  // başta yer alıyor (bkz. dosya başındaki DUEL_SELECTABLE_LEAGUES notu —
  // piyasa değeri senkronu için kasıtlı). "seen" mantığı ilk gelen ligi
  // kalıcı etiket olarak kaydettiğinden, sıralamayı burada değiştirmezsek
  // Fenerbahçe gibi hem Süper Lig'de hem Şampiyonlar Ligi'nde olan takımlar
  // yanlışlıkla "Champions League" etiketiyle görünür. Fetch sırası
  // (allLeagueResults) değişmiyor, sadece bu döngünün işleme sırası.
  const orderedResults = [...allLeagueResults].sort((a, b) => {
    const aIsCup = leagueMeta.get(a.leagueId)?.country === "Avrupa" ? 1 : 0
    const bIsCup = leagueMeta.get(b.leagueId)?.country === "Avrupa" ? 1 : 0
    return aIsCup - bIsCup
  })

  for (const { leagueId, teams } of orderedResults) {
    const meta = leagueMeta.get(leagueId)
    for (const entry of teams) {
      const t = entry.team
      if (t.national) continue
      if (seen.has(t.id)) continue
      seen.add(t.id)
      all.push({
        id: t.id,
        name: t.name,
        logo: t.logo,
        country: toTurkishCountry(t.country),
        leagueId,
        leagueName: meta?.name ?? `Lig ${leagueId}`,
        leagueLogo: meta?.logo ?? "",
      })
    }
  }
  return all
}

const CACHE_KEY_PREFIX = "ed:featuredteams"

/** 24 öne çıkan ligin takım dizinini döner — sezon bazlı Redis cache'i, TR gece yarısında TTL biter. */
export async function getFeaturedTeamsDirectory(): Promise<FeaturedTeamEntry[]> {
  const season = new Date().getFullYear()
  const cacheKey = `${CACHE_KEY_PREFIX}:${season}`

  if (redis) {
    try {
      const cached = await redis.get<FeaturedTeamEntry[]>(cacheKey)
      if (cached) return cached
    } catch (err) {
      console.log("[v0] redis getFeaturedTeamsDirectory failed:", err instanceof Error ? err.message : err)
    }
  }

  const teams = await fetchFeaturedTeams(season)

  if (redis && teams.length > 0) {
    try {
      await redis.set(cacheKey, teams, { ex: secondsUntilMidnightTR() })
    } catch (err) {
      console.log("[v0] redis setFeaturedTeamsDirectory failed:", err instanceof Error ? err.message : err)
    }
  }

  return teams
}
