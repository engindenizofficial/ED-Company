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
    country: "Europe",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["sampiyonlar ligi", "şampiyonlar ligi", "ucl", "cl", "avrupa"],
  },
  {
    id: 3,
    name: "Europa League",
    logo: "https://media.api-sports.io/football/leagues/3.png",
    country: "Europe",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["avrupa ligi", "uel", "el", "avrupa"],
  },
  {
    id: 848,
    name: "Conference League",
    logo: "https://media.api-sports.io/football/leagues/848.png",
    country: "Europe",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["konferans ligi", "uecl", "avrupa"],
  },
  // Ulusal Ligler
  {
    id: 39,
    name: "Premier League",
    logo: "https://media.api-sports.io/football/leagues/39.png",
    country: "England",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["premier lig", "ingiltere ligi", "ingiliz ligi", "england"],
  },
  {
    id: 140,
    name: "La Liga",
    logo: "https://media.api-sports.io/football/leagues/140.png",
    country: "Spain",
    flagUrl: "https://media.api-sports.io/flags/es.svg",
    aliases: ["ispanya ligi", "ispanya", "spain"],
  },
  {
    id: 135,
    name: "Serie A",
    logo: "https://media.api-sports.io/football/leagues/135.png",
    country: "Italy",
    flagUrl: "https://media.api-sports.io/flags/it.svg",
    aliases: ["italya ligi", "italya", "italy"],
  },
  {
    id: 78,
    name: "Bundesliga",
    logo: "https://media.api-sports.io/football/leagues/78.png",
    country: "Germany",
    flagUrl: "https://media.api-sports.io/flags/de.svg",
    aliases: ["almanya ligi", "almanya", "germany"],
  },
  {
    id: 61,
    name: "Ligue 1",
    logo: "https://media.api-sports.io/football/leagues/61.png",
    country: "France",
    flagUrl: "https://media.api-sports.io/flags/fr.svg",
    aliases: ["fransa ligi", "fransa", "france"],
  },
  {
    id: 94,
    name: "Primeira Liga",
    logo: "https://media.api-sports.io/football/leagues/94.png",
    country: "Portugal",
    flagUrl: "https://media.api-sports.io/flags/pt.svg",
    aliases: ["portekiz ligi", "portekiz", "portugal"],
  },
  {
    id: 203,
    name: "Süper Lig",
    logo: "https://media.api-sports.io/football/leagues/203.png",
    country: "Turkey",
    flagUrl: "https://media.api-sports.io/flags/tr.svg",
    aliases: ["super lig", "turkiye ligi", "türkiye ligi", "turkiye", "turkey"],
  },
  {
    id: 88,
    name: "Eredivisie",
    logo: "https://media.api-sports.io/football/leagues/88.png",
    country: "Netherlands",
    flagUrl: "https://media.api-sports.io/flags/nl.svg",
    aliases: ["hollanda ligi", "hollanda", "netherlands"],
  },
  {
    id: 235,
    name: "Premier Liga",
    logo: "https://media.api-sports.io/football/leagues/235.png",
    country: "Russia",
    flagUrl: "https://media.api-sports.io/flags/ru.svg",
    aliases: ["rusya ligi", "rusya", "russia"],
  },
  {
    id: 144,
    name: "Jupiler Pro League",
    logo: "https://media.api-sports.io/football/leagues/144.png",
    country: "Belgium",
    flagUrl: "https://media.api-sports.io/flags/be.svg",
    aliases: ["belcika ligi", "belçika ligi", "belcika", "belçika", "belgium"],
  },
  {
    id: 197,
    name: "Super League",
    logo: "https://media.api-sports.io/football/leagues/197.png",
    country: "Greece",
    flagUrl: "https://media.api-sports.io/flags/gr.svg",
    aliases: ["yunanistan ligi", "yunanistan", "greece"],
  },
  {
    id: 332,
    name: "Ukrainian Premier League",
    logo: "https://media.api-sports.io/football/leagues/332.png",
    country: "Ukraine",
    flagUrl: "https://media.api-sports.io/flags/ua.svg",
    aliases: ["ukrayna ligi", "ukrayna", "ukraine"],
  },
  {
    id: 345,
    name: "Czech Liga",
    logo: "https://media.api-sports.io/football/leagues/345.png",
    country: "Czech Republic",
    flagUrl: "https://media.api-sports.io/flags/cz.svg",
    aliases: ["cekya ligi", "çekya ligi", "cek cumhuriyeti", "czech"],
  },
  {
    id: 119,
    name: "Superliga",
    logo: "https://media.api-sports.io/football/leagues/119.png",
    country: "Denmark",
    flagUrl: "https://media.api-sports.io/flags/dk.svg",
    aliases: ["danimarka ligi", "danimarka", "denmark"],
  },
  {
    id: 179,
    name: "Scottish Premiership",
    logo: "https://media.api-sports.io/football/leagues/179.png",
    country: "Scotland",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["iskocya ligi", "iskocya", "scotland"],
  },
  {
    id: 106,
    name: "Ekstraklasa",
    logo: "https://media.api-sports.io/football/leagues/106.png",
    country: "Poland",
    flagUrl: "https://media.api-sports.io/flags/pl.svg",
    aliases: ["polonya ligi", "polonya", "poland"],
  },
  {
    id: 103,
    name: "Eliteserien",
    logo: "https://media.api-sports.io/football/leagues/103.png",
    country: "Norway",
    flagUrl: "https://media.api-sports.io/flags/no.svg",
    aliases: ["norvec ligi", "norveç ligi", "norvec", "norveç", "norway"],
  },
  {
    id: 218,
    name: "Bundesliga",
    logo: "https://media.api-sports.io/football/leagues/218.png",
    country: "Austria",
    flagUrl: "https://media.api-sports.io/flags/at.svg",
    aliases: ["avusturya ligi", "avusturya", "austria"],
  },
  {
    id: 207,
    name: "Super League",
    logo: "https://media.api-sports.io/football/leagues/207.png",
    country: "Switzerland",
    flagUrl: "https://media.api-sports.io/flags/ch.svg",
    aliases: ["isvicre ligi", "İsviçre ligi", "isvicre", "İsviçre", "switzerland"],
  },
  {
    id: 172,
    name: "Super Liga",
    logo: "https://media.api-sports.io/football/leagues/172.png",
    country: "Serbia",
    flagUrl: "https://media.api-sports.io/flags/rs.svg",
    aliases: ["sirbistan ligi", "sırbistan ligi", "sirbistan", "sırbistan", "serbia"],
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
