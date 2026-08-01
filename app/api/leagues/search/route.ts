import { NextRequest, NextResponse } from "next/server"

// En iyi 20 lig — statik liste, API isteği gerekmez, çok hızlı
export interface LeagueSearchResult {
  id: number
  name: string
  logo: string
  country: string
  flagUrl: string
  /** Türkçe alternatif isim — arama için */
  aliases?: string[]
}

const TOP_LEAGUES: LeagueSearchResult[] = [
  // Avrupa Kupaları
  {
    id: 2,
    name: "Champions League",
    logo: "https://media.api-sports.io/football/leagues/2.png",
    country: "Avrupa",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["sampiyonlar ligi", "şampiyonlar ligi", "ucl", "cl"],
  },
  {
    id: 3,
    name: "Europa League",
    logo: "https://media.api-sports.io/football/leagues/3.png",
    country: "Avrupa",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["avrupa ligi", "uel", "el"],
  },
  {
    id: 848,
    name: "Conference League",
    logo: "https://media.api-sports.io/football/leagues/848.png",
    country: "Avrupa",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["konferans ligi", "uecl"],
  },
  // Ulusal Ligler
  {
    id: 39,
    name: "Premier League",
    logo: "https://media.api-sports.io/football/leagues/39.png",
    country: "İngiltere",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["premier lig", "ingiliz ligi"],
  },
  {
    id: 140,
    name: "La Liga",
    logo: "https://media.api-sports.io/football/leagues/140.png",
    country: "İspanya",
    flagUrl: "https://media.api-sports.io/flags/es.svg",
    aliases: ["ispanya ligi"],
  },
  {
    id: 135,
    name: "Serie A",
    logo: "https://media.api-sports.io/football/leagues/135.png",
    country: "İtalya",
    flagUrl: "https://media.api-sports.io/flags/it.svg",
    aliases: ["italya ligi"],
  },
  {
    id: 78,
    name: "Bundesliga",
    logo: "https://media.api-sports.io/football/leagues/78.png",
    country: "Almanya",
    flagUrl: "https://media.api-sports.io/flags/de.svg",
    aliases: ["almanya ligi"],
  },
  {
    id: 61,
    name: "Ligue 1",
    logo: "https://media.api-sports.io/football/leagues/61.png",
    country: "Fransa",
    flagUrl: "https://media.api-sports.io/flags/fr.svg",
    aliases: ["fransa ligi"],
  },
  {
    id: 94,
    name: "Primeira Liga",
    logo: "https://media.api-sports.io/football/leagues/94.png",
    country: "Portekiz",
    flagUrl: "https://media.api-sports.io/flags/pt.svg",
    aliases: ["portekiz ligi"],
  },
  {
    id: 203,
    name: "Süper Lig",
    logo: "https://media.api-sports.io/football/leagues/203.png",
    country: "Türkiye",
    flagUrl: "https://media.api-sports.io/flags/tr.svg",
    aliases: ["super lig", "türkiye ligi", "turkiye ligi"],
  },
  {
    id: 88,
    name: "Eredivisie",
    logo: "https://media.api-sports.io/football/leagues/88.png",
    country: "Hollanda",
    flagUrl: "https://media.api-sports.io/flags/nl.svg",
    aliases: ["hollanda ligi"],
  },
  {
    id: 235,
    name: "Premier Liga",
    logo: "https://media.api-sports.io/football/leagues/235.png",
    country: "Rusya",
    flagUrl: "https://media.api-sports.io/flags/ru.svg",
    aliases: ["rusya ligi"],
  },
  {
    id: 144,
    name: "Jupiler Pro League",
    logo: "https://media.api-sports.io/football/leagues/144.png",
    country: "Belçika",
    flagUrl: "https://media.api-sports.io/flags/be.svg",
    aliases: ["belcika ligi", "belçika ligi"],
  },
  {
    id: 197,
    name: "Super League",
    logo: "https://media.api-sports.io/football/leagues/197.png",
    country: "Yunanistan",
    flagUrl: "https://media.api-sports.io/flags/gr.svg",
    aliases: ["yunanistan ligi"],
  },
  {
    id: 332,
    name: "Ukrainian Premier League",
    logo: "https://media.api-sports.io/football/leagues/332.png",
    country: "Ukrayna",
    flagUrl: "https://media.api-sports.io/flags/ua.svg",
    aliases: ["ukrayna ligi"],
  },
  {
    id: 345,
    name: "Czech Liga",
    logo: "https://media.api-sports.io/football/leagues/345.png",
    country: "Çekya",
    flagUrl: "https://media.api-sports.io/flags/cz.svg",
    aliases: ["cekya ligi", "çek cumhuriyeti ligi"],
  },
  {
    id: 119,
    name: "Superliga",
    logo: "https://media.api-sports.io/football/leagues/119.png",
    country: "Danimarka",
    flagUrl: "https://media.api-sports.io/flags/dk.svg",
    aliases: ["danimarka ligi"],
  },
  {
    id: 179,
    name: "Scottish Premiership",
    logo: "https://media.api-sports.io/football/leagues/179.png",
    country: "İskoçya",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["iskocya ligi", "iskoçya ligi"],
  },
  {
    id: 106,
    name: "Ekstraklasa",
    logo: "https://media.api-sports.io/football/leagues/106.png",
    country: "Polonya",
    flagUrl: "https://media.api-sports.io/flags/pl.svg",
    aliases: ["polonya ligi"],
  },
  {
    id: 103,
    name: "Eliteserien",
    logo: "https://media.api-sports.io/football/leagues/103.png",
    country: "Norveç",
    flagUrl: "https://media.api-sports.io/flags/no.svg",
    aliases: ["norvec ligi", "norveç ligi"],
  },
  {
    id: 218,
    name: "Bundesliga",
    logo: "https://media.api-sports.io/football/leagues/218.png",
    country: "Avusturya",
    flagUrl: "https://media.api-sports.io/flags/at.svg",
    aliases: ["avusturya ligi"],
  },
  {
    id: 207,
    name: "Super League",
    logo: "https://media.api-sports.io/football/leagues/207.png",
    country: "İsviçre",
    flagUrl: "https://media.api-sports.io/flags/ch.svg",
    aliases: ["isvicre ligi", "İsviçre ligi"],
  },
  {
    id: 172,
    name: "Super Liga",
    logo: "https://media.api-sports.io/football/leagues/172.png",
    country: "Sırbistan",
    flagUrl: "https://media.api-sports.io/flags/rs.svg",
    aliases: ["sirbistan ligi", "sırbistan ligi"],
  },
]

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

  // Sorgu boşsa tüm ligleri döndür
  if (q.length === 0) {
    return NextResponse.json({ results: TOP_LEAGUES })
  }

  const qNorm = normalizeTR(q)

  const results = TOP_LEAGUES.filter((league) => {
    const nameNorm = normalizeTR(league.name)
    const countryNorm = normalizeTR(league.country)
    if (nameNorm.includes(qNorm) || countryNorm.includes(qNorm)) return true
    if (league.aliases?.some((a) => normalizeTR(a).includes(qNorm))) return true
    return false
  })

  return NextResponse.json({ results })
}
