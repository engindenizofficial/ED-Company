import { NextRequest, NextResponse } from "next/server"
import { getCachedAllTeams, setCachedAllTeams } from "@/lib/redis"
import { toTurkishCountry } from "@/lib/tr-aliases"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// Aranabilir ligler (API-Football league ID'leri) — milli takım ligleri hariç.
// ÖNEMLI: Ulusal ligler önce, Avrupa kupaları en sona.
// seen-set mantığı nedeniyle ilk gelen ligde kaydedilen takım o lig etiketi
// alır — bu yüzden ulusal ligler önde olmalı ki Liverpool "Premier League"
// altında, Galatasaray "Süper Lig" altında görünsün.
const TOP_LEAGUE_IDS = [
  39,  // Premier League (İngiltere)
  140, // La Liga (İspanya)
  135, // Serie A (İtalya)
  78,  // Bundesliga (Almanya)
  61,  // Ligue 1 (Fransa)
  94,  // Primeira Liga (Portekiz)
  203, // Süper Lig (Türkiye)
  88,  // Eredivisie (Hollanda)
  235, // Premier Liga (Rusya)
  144, // Jupiler Pro League (Belçika)
  197, // Super League (Yunanistan)
  333, // Ukrainian Premier League (Ukrayna)
  345, // Czech Liga (Çekya)
  119, // Superliga (Danimarka)
  179, // Scottish Premiership (İskoçya)
  106, // Ekstraklasa (Polonya)
  103, // Eliteserien (Norveç)
  218, // Bundesliga (Avusturya)
  207, // Super League (İsviçre)
  286, // Super Liga (Sırbistan)
  2,   // Champions League (ulusal ligde kaydedilemeyen takımlar için)
  3,   // Europa League
  848, // Conference League
]

// Sadece benzersiz ID'ler
const LEAGUE_IDS = [...new Set(TOP_LEAGUE_IDS)]

interface RawTeam {
  team: {
    id: number
    name: string
    logo: string
    national: boolean
    country: string
  }
  venue?: {
    name?: string | null
    city?: string | null
  }
}

export interface TeamSearchResult {
  id: number
  name: string
  logo: string
  country: string
  leagueId: number
  leagueName: string
  leagueLogo: string
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
      next: { revalidate: secondsUntilMidnightTR() }, // TR gece yarısına kadar cache'le
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as RawTeam[]) ?? []
  } catch {
    return []
  }
}

// Türkçe normalize: ş→s, ç→c, ğ→g, ü→u, ö→o, ı→i
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

const LEAGUE_META: Record<number, { name: string; logo: string }> = {
  2:   { name: "Champions League",         logo: "https://media.api-sports.io/football/leagues/2.png" },
  3:   { name: "Europa League",            logo: "https://media.api-sports.io/football/leagues/3.png" },
  848: { name: "Conference League",        logo: "https://media.api-sports.io/football/leagues/848.png" },
  39:  { name: "Premier League",           logo: "https://media.api-sports.io/football/leagues/39.png" },
  140: { name: "La Liga",                  logo: "https://media.api-sports.io/football/leagues/140.png" },
  135: { name: "Serie A",                  logo: "https://media.api-sports.io/football/leagues/135.png" },
  78:  { name: "Bundesliga",               logo: "https://media.api-sports.io/football/leagues/78.png" },
  61:  { name: "Ligue 1",                  logo: "https://media.api-sports.io/football/leagues/61.png" },
  94:  { name: "Primeira Liga",            logo: "https://media.api-sports.io/football/leagues/94.png" },
  203: { name: "Süper Lig",               logo: "https://media.api-sports.io/football/leagues/203.png" },
  88:  { name: "Eredivisie",               logo: "https://media.api-sports.io/football/leagues/88.png" },
  235: { name: "Premier Liga",             logo: "https://media.api-sports.io/football/leagues/235.png" },
  144: { name: "Jupiler Pro League",       logo: "https://media.api-sports.io/football/leagues/144.png" },
  197: { name: "Super League",             logo: "https://media.api-sports.io/football/leagues/197.png" },
  333: { name: "Ukrainian Premier League", logo: "https://media.api-sports.io/football/leagues/333.png" },
  345: { name: "Czech Liga",               logo: "https://media.api-sports.io/football/leagues/345.png" },
  119: { name: "Superliga",                logo: "https://media.api-sports.io/football/leagues/119.png" },
  179: { name: "Scottish Premiership",     logo: "https://media.api-sports.io/football/leagues/179.png" },
  106: { name: "Ekstraklasa",              logo: "https://media.api-sports.io/football/leagues/106.png" },
  103: { name: "Eliteserien",              logo: "https://media.api-sports.io/football/leagues/103.png" },
  218: { name: "Bundesliga",               logo: "https://media.api-sports.io/football/leagues/218.png" },
  207: { name: "Super League",             logo: "https://media.api-sports.io/football/leagues/207.png" },
  286: { name: "Super Liga",               logo: "https://media.api-sports.io/football/leagues/286.png" },
}

/** 23 ligin tüm takımlarını API'den çekip döndürür (Redis cache yoksa). */
async function fetchAllTeams(season: number): Promise<TeamSearchResult[]> {
  const promises = LEAGUE_IDS.map(async (leagueId) => {
    const raw = await apiFetch("/teams", { league: leagueId, season })
    return { leagueId, teams: raw }
  })
  const allLeagueResults = await Promise.all(promises)

  const seen = new Set<number>()
  const all: TeamSearchResult[] = []

  for (const { leagueId, teams } of allLeagueResults) {
    const meta = LEAGUE_META[leagueId] ?? { name: `Lig ${leagueId}`, logo: "" }
    for (const entry of teams) {
      const t = entry.team
      if (t.national) continue
      // Bir takım birden fazla ligde/kupada olabilir — öncelik ulusal lige ver (ID sırası)
      if (seen.has(t.id)) continue
      seen.add(t.id)
      all.push({
        id: t.id,
        name: t.name,
        logo: t.logo,
        country: toTurkishCountry(t.country),
        leagueId,
        leagueName: meta.name,
        leagueLogo: meta.logo,
      })
    }
  }
  return all
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = new Date().getFullYear()

  // 1) Cache'den oku — yoksa API'den çekip yaz
  let allTeams = await getCachedAllTeams(season)
  if (!allTeams) {
    allTeams = await fetchAllTeams(season)
    if (allTeams.length > 0) {
      await setCachedAllTeams(season, allTeams)
    }
  }

  // 2) Lokal filtreleme — sıfır API isteği
  const qNorm = normalizeTR(q)
  const results = allTeams.filter((t) => normalizeTR(t.name).includes(qNorm))

  return NextResponse.json({ results: results.slice(0, 20) })
}
