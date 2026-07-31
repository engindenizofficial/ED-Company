import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// Dünyanın en iyi 20 ligi + büyük yıldızların oynadığı ek ligler
const TOP_LEAGUE_IDS = [
  39,  // Premier League (İngiltere)
  140, // La Liga (İspanya)
  135, // Serie A (İtalya)
  78,  // Bundesliga (Almanya)
  61,  // Ligue 1 (Fransa)
  203, // Süper Lig (Türkiye)
  88,  // Eredivisie (Hollanda)
  94,  // Primeira Liga (Portekiz)
  144, // Jupiler Pro League (Belçika)
  179, // Scottish Premiership (İskoçya)
  197, // Super League (Yunanistan)
  207, // Super League (İsviçre)
  253, // MLS (ABD)
  262, // Liga MX (Meksika)
  71,  // Série A (Brezilya)
  128, // Liga Profesional (Arjantin)
  307, // Saudi Pro League — Ronaldo, Benzema vb.
  98,  // J1 League (Japonya)
  169, // Ekstraklasa (Polonya)
  235, // Premier Liga (Rusya)
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Conference League
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

// In-memory cache: arama sonuçlarını 10 dakika sakla (API rate limit koruması)
const searchCache = new Map<string, { data: PlayerSearchResult[]; ts: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 dakika

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

// Normalize: Türkçe + tüm aksan/diakritik karakterleri kaldır (é→e, ã→a, ñ→n vb.)
function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ı/g, "i").replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

async function fetchPlayersFromAPI(
  q: string,
  leagueId: number,
  season: number,
): Promise<any[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const params = new URLSearchParams({
    search: q,
    league: String(leagueId),
    season: String(season),
  })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${BASE_URL}/players?${params}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 600 }, // CDN/ISR cache: 10 dakika
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const json = await res.json()
    return json.response ?? []
  } catch {
    return []
  }
}

function mapEntries(entries: any[]): PlayerSearchResult[] {
  return entries.map((entry) => {
    const p = entry.player ?? {}
    const firstStat = entry.statistics?.[0] ?? {}
    return {
      id: p.id ?? 0,
      name: p.name ?? "",
      photo: p.photo ?? null,
      nationality: p.nationality ?? null,
      age: p.age ?? null,
      teamId: firstStat.team?.id ?? null,
      teamName: firstStat.team?.name ?? null,
      teamLogo: firstStat.team?.logo ?? null,
    }
  })
}

async function searchPlayersInLeague(
  q: string,
  leagueId: number,
  season: number,
): Promise<PlayerSearchResult[]> {
  let entries = await fetchPlayersFromAPI(q, leagueId, season)
  // Mevcut sezonda sonuç yoksa bir önceki sezonu dene
  if (entries.length === 0) {
    entries = await fetchPlayersFromAPI(q, leagueId, season - 1)
  }
  return mapEntries(entries)
}

// Ligleri n'li gruplar halinde sırayla işle (rate limit koruması)
async function searchInBatches(
  q: string,
  season: number,
  batchSize = 8,
): Promise<PlayerSearchResult[][]> {
  const results: PlayerSearchResult[][] = []
  for (let i = 0; i < TOP_LEAGUE_IDS.length; i += batchSize) {
    const batch = TOP_LEAGUE_IDS.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map((leagueId) => searchPlayersInLeague(q, leagueId, season))
    )
    for (const r of batchResults) {
      results.push(r.status === "fulfilled" ? r.value : [])
    }
  }
  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = currentSeason()
  const cacheKey = `${normalize(q)}:${season}`

  // Cache'den dön
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ results: cached.data })
  }

  const perLeague = await searchInBatches(q, season)

  // Deduplikasyon + normalize filtrele
  const qNorm = normalize(q)
  const seen = new Set<number>()
  const results: PlayerSearchResult[] = []

  for (const leaguePlayers of perLeague) {
    for (const p of leaguePlayers) {
      if (!p.id || seen.has(p.id)) continue
      if (!normalize(p.name).includes(qNorm)) continue
      seen.add(p.id)
      results.push(p)
    }
  }

  const final = results.slice(0, 50)

  // Sadece sonuç varsa cache'e yaz — boş sonucu cache'leme (rate limit geçici hataları için)
  if (final.length > 0) {
    searchCache.set(cacheKey, { data: final, ts: Date.now() })
  }

  return NextResponse.json({ results: final })
}
