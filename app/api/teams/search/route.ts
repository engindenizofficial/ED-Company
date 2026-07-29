import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

// En iyi 20 lig (API-Football league ID'leri) — milli takım ligleri hariç
const TOP_LEAGUE_IDS = [
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  203, // Süper Lig
  2,   // Champions League
  3,   // Europa League
  848, // Conference League
  88,  // Eredivisie
  94,  // Primeira Liga
  144, // Jupiler Pro League (Belçika)
  88,  // Eredivisie
  179, // Scottish Premiership
  197, // Super League (Yunanistan)
  207, // Super League (İsviçre)
  218, // Ligue Pro (Avusturya)
  235, // Premier Liga (Rusya)
  253, // Major League Soccer
  262, // Liga MX
  71,  // Série A (Brezilya)
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

async function apiFetch(path: string, params: Record<string, string | number>): Promise<RawTeam[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))

  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 86400 }, // 24 saat cache — takım listesi nadiren değişir
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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const season = new Date().getFullYear()

  // Tüm ligleri paralel sorgula
  const promises = LEAGUE_IDS.map(async (leagueId) => {
    const raw = await apiFetch("/teams", { league: leagueId, season })
    return { leagueId, teams: raw }
  })

  const allLeagueResults = await Promise.all(promises)

  // Lig metadata için ayrı bir istek atmıyoruz — fixture listesinde zaten var
  // Lig adını ve logosunu API /leagues endpoint'inden çekmek yerine
  // sabit bir map kullanıyoruz (daha hızlı, API limiti tüketmez)
  const LEAGUE_META: Record<number, { name: string; logo: string }> = {
    39: { name: "Premier League", logo: "https://media.api-sports.io/football/leagues/39.png" },
    140: { name: "La Liga", logo: "https://media.api-sports.io/football/leagues/140.png" },
    135: { name: "Serie A", logo: "https://media.api-sports.io/football/leagues/135.png" },
    78: { name: "Bundesliga", logo: "https://media.api-sports.io/football/leagues/78.png" },
    61: { name: "Ligue 1", logo: "https://media.api-sports.io/football/leagues/61.png" },
    203: { name: "Süper Lig", logo: "https://media.api-sports.io/football/leagues/203.png" },
    2: { name: "Champions League", logo: "https://media.api-sports.io/football/leagues/2.png" },
    3: { name: "Europa League", logo: "https://media.api-sports.io/football/leagues/3.png" },
    848: { name: "Conference League", logo: "https://media.api-sports.io/football/leagues/848.png" },
    88: { name: "Eredivisie", logo: "https://media.api-sports.io/football/leagues/88.png" },
    94: { name: "Primeira Liga", logo: "https://media.api-sports.io/football/leagues/94.png" },
    144: { name: "Jupiler Pro League", logo: "https://media.api-sports.io/football/leagues/144.png" },
    179: { name: "Scottish Premiership", logo: "https://media.api-sports.io/football/leagues/179.png" },
    197: { name: "Super League", logo: "https://media.api-sports.io/football/leagues/197.png" },
    207: { name: "Super League", logo: "https://media.api-sports.io/football/leagues/207.png" },
    218: { name: "Bundesliga", logo: "https://media.api-sports.io/football/leagues/218.png" },
    235: { name: "Premier Liga", logo: "https://media.api-sports.io/football/leagues/235.png" },
    253: { name: "MLS", logo: "https://media.api-sports.io/football/leagues/253.png" },
    262: { name: "Liga MX", logo: "https://media.api-sports.io/football/leagues/262.png" },
    71: { name: "Série A", logo: "https://media.api-sports.io/football/leagues/71.png" },
  }

  const qNorm = normalizeTR(q)
  const seen = new Set<number>()
  const results: TeamSearchResult[] = []

  for (const { leagueId, teams } of allLeagueResults) {
    const meta = LEAGUE_META[leagueId] ?? { name: `Lig ${leagueId}`, logo: "" }
    for (const entry of teams) {
      const t = entry.team
      // Milli takımları atla
      if (t.national) continue
      // Duplikasyon kontrolü (bir takım birden fazla ligde/kupada olabilir)
      if (seen.has(t.id)) continue
      // Eşleşme kontrolü
      const nameNorm = normalizeTR(t.name)
      if (!nameNorm.includes(qNorm)) continue
      seen.add(t.id)
      results.push({
        id: t.id,
        name: t.name,
        logo: t.logo,
        country: t.country,
        leagueId,
        leagueName: meta.name,
        leagueLogo: meta.logo,
      })
    }
  }

  // En fazla 20 sonuç döndür
  return NextResponse.json({ results: results.slice(0, 20) })
}
