// ---------------------------------------------------------------------------
// TEK KAYNAK (single source of truth): "öne çıkan" 24 lig.
//
// Bu dosya, id, isim, ülke, logo, bayrak ve arama takma adlarını (aliases)
// TEK bir yerde tutar. Aşağıdaki üç yer bu diziden türetilir:
//   1. lib/api-football.ts        -> FEATURED_LEAGUE_IDS (maç sıralaması)
//   2. app/api/leagues/search/... -> TOP_LEAGUES (arama kutusu)
//   3. lib/transfermarkt-scraper.ts -> SCRAPABLE_LEAGUE_IDS (piyasa değeri cron'u)
//
// Yeni bir lig eklemek / çıkarmak / sırasını değiştirmek istediğinde SADECE
// bu diziyi güncelle — diğer üç yer otomatik olarak senkron kalır.
// (Transfermarkt kod eşleşmesi hâlâ lib/transfermarkt-scraper.ts içindeki
// LEAGUE_TO_TRANSFERMARKT_CODE haritasına elle eklenmeli; o harita için de
// derleme zamanında eksik id kontrolü zaten var.)
// ---------------------------------------------------------------------------

export interface FeaturedLeague {
  id: number
  name: string
  country: string
  logo: string
  flagUrl: string
  /** Türkçe alternatif isim(ler) — arama kutusu için. */
  aliases?: string[]
}

export const FEATURED_LEAGUES: FeaturedLeague[] = [
  // Avrupa Kupaları
  {
    id: 2,
    name: "Champions League",
    country: "Avrupa",
    logo: "https://media.api-sports.io/football/leagues/2.png",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["sampiyonlar ligi", "şampiyonlar ligi", "ucl", "cl"],
  },
  {
    id: 3,
    name: "Europa League",
    country: "Avrupa",
    logo: "https://media.api-sports.io/football/leagues/3.png",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["avrupa ligi", "uel", "el"],
  },
  {
    id: 848,
    name: "Conference League",
    country: "Avrupa",
    logo: "https://media.api-sports.io/football/leagues/848.png",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["konferans ligi", "uecl"],
  },
  {
    id: 531,
    name: "UEFA Super Cup",
    country: "Avrupa",
    logo: "https://media.api-sports.io/football/leagues/531.png",
    flagUrl: "https://media.api-sports.io/flags/eu.svg",
    aliases: ["super kupa", "süper kupa", "uefa super kupa", "uefa süper kupa"],
  },
  // Ulusal Ligler
  {
    id: 39,
    name: "Premier League",
    country: "İngiltere",
    logo: "https://media.api-sports.io/football/leagues/39.png",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["premier lig", "ingiliz ligi"],
  },
  {
    id: 140,
    name: "La Liga",
    country: "İspanya",
    logo: "https://media.api-sports.io/football/leagues/140.png",
    flagUrl: "https://media.api-sports.io/flags/es.svg",
    aliases: ["ispanya ligi"],
  },
  {
    id: 135,
    name: "Serie A",
    country: "İtalya",
    logo: "https://media.api-sports.io/football/leagues/135.png",
    flagUrl: "https://media.api-sports.io/flags/it.svg",
    aliases: ["italya ligi"],
  },
  {
    id: 78,
    name: "Bundesliga",
    country: "Almanya",
    logo: "https://media.api-sports.io/football/leagues/78.png",
    flagUrl: "https://media.api-sports.io/flags/de.svg",
    aliases: ["almanya ligi"],
  },
  {
    id: 61,
    name: "Ligue 1",
    country: "Fransa",
    logo: "https://media.api-sports.io/football/leagues/61.png",
    flagUrl: "https://media.api-sports.io/flags/fr.svg",
    aliases: ["fransa ligi"],
  },
  {
    id: 94,
    name: "Primeira Liga",
    country: "Portekiz",
    logo: "https://media.api-sports.io/football/leagues/94.png",
    flagUrl: "https://media.api-sports.io/flags/pt.svg",
    aliases: ["portekiz ligi"],
  },
  {
    id: 203,
    name: "Süper Lig",
    country: "Türkiye",
    logo: "https://media.api-sports.io/football/leagues/203.png",
    flagUrl: "https://media.api-sports.io/flags/tr.svg",
    aliases: ["super lig", "türkiye ligi", "turkiye ligi"],
  },
  {
    id: 88,
    name: "Eredivisie",
    country: "Hollanda",
    logo: "https://media.api-sports.io/football/leagues/88.png",
    flagUrl: "https://media.api-sports.io/flags/nl.svg",
    aliases: ["hollanda ligi"],
  },
  {
    id: 235,
    name: "Premier Liga",
    country: "Rusya",
    logo: "https://media.api-sports.io/football/leagues/235.png",
    flagUrl: "https://media.api-sports.io/flags/ru.svg",
    aliases: ["rusya ligi"],
  },
  {
    id: 144,
    name: "Jupiler Pro League",
    country: "Belçika",
    logo: "https://media.api-sports.io/football/leagues/144.png",
    flagUrl: "https://media.api-sports.io/flags/be.svg",
    aliases: ["belcika ligi", "belçika ligi"],
  },
  {
    id: 197,
    name: "Super League",
    country: "Yunanistan",
    logo: "https://media.api-sports.io/football/leagues/197.png",
    flagUrl: "https://media.api-sports.io/flags/gr.svg",
    aliases: ["yunanistan ligi"],
  },
  {
    id: 333,
    name: "Ukrainian Premier League",
    country: "Ukrayna",
    logo: "https://media.api-sports.io/football/leagues/333.png",
    flagUrl: "https://media.api-sports.io/flags/ua.svg",
    aliases: ["ukrayna ligi"],
  },
  {
    id: 345,
    name: "Czech Liga",
    country: "Çekya",
    logo: "https://media.api-sports.io/football/leagues/345.png",
    flagUrl: "https://media.api-sports.io/flags/cz.svg",
    aliases: ["cekya ligi", "çek cumhuriyeti ligi"],
  },
  {
    id: 119,
    name: "Superliga",
    country: "Danimarka",
    logo: "https://media.api-sports.io/football/leagues/119.png",
    flagUrl: "https://media.api-sports.io/flags/dk.svg",
    aliases: ["danimarka ligi"],
  },
  {
    id: 179,
    name: "Scottish Premiership",
    country: "İskoçya",
    logo: "https://media.api-sports.io/football/leagues/179.png",
    flagUrl: "https://media.api-sports.io/flags/gb.svg",
    aliases: ["iskocya ligi", "iskoçya ligi"],
  },
  {
    id: 106,
    name: "Ekstraklasa",
    country: "Polonya",
    logo: "https://media.api-sports.io/football/leagues/106.png",
    flagUrl: "https://media.api-sports.io/flags/pl.svg",
    aliases: ["polonya ligi"],
  },
  {
    id: 103,
    name: "Eliteserien",
    country: "Norveç",
    logo: "https://media.api-sports.io/football/leagues/103.png",
    flagUrl: "https://media.api-sports.io/flags/no.svg",
    aliases: ["norvec ligi", "norveç ligi"],
  },
  {
    id: 218,
    name: "Bundesliga",
    country: "Avusturya",
    logo: "https://media.api-sports.io/football/leagues/218.png",
    flagUrl: "https://media.api-sports.io/flags/at.svg",
    aliases: ["avusturya ligi"],
  },
  {
    id: 207,
    name: "Super League",
    country: "İsviçre",
    logo: "https://media.api-sports.io/football/leagues/207.png",
    flagUrl: "https://media.api-sports.io/flags/ch.svg",
    aliases: ["isvicre ligi", "İsviçre ligi"],
  },
  {
    id: 286,
    name: "Super Liga",
    country: "Sırbistan",
    logo: "https://media.api-sports.io/football/leagues/286.png",
    flagUrl: "https://media.api-sports.io/flags/rs.svg",
    aliases: ["sirbistan ligi", "sırbistan ligi"],
  },
  {
    id: 307,
    name: "Saudi Pro League",
    country: "Suudi Arabistan",
    logo: "https://media.api-sports.io/football/leagues/307.png",
    flagUrl: "https://media.api-sports.io/flags/sa.svg",
    aliases: ["arabistan ligi", "suudi arabistan ligi", "suudi ligi"],
  },
  {
    id: 253,
    name: "Major League Soccer",
    country: "ABD",
    logo: "https://media.api-sports.io/football/leagues/253.png",
    flagUrl: "https://media.api-sports.io/flags/us.svg",
    aliases: ["amerika ligi", "mls", "abd ligi"],
  },
  {
    id: 128,
    name: "Liga Profesional Argentina",
    country: "Arjantin",
    logo: "https://media.api-sports.io/football/leagues/128.png",
    flagUrl: "https://media.api-sports.io/flags/ar.svg",
    aliases: ["arjantin ligi"],
  },
]

/** `FEATURED_LEAGUES`'ten türetilen sıralı id listesi — asla elle düzenlenmez. */
export const FEATURED_LEAGUE_IDS: number[] = FEATURED_LEAGUES.map((l) => l.id)

/**
 * "Piyasa Değeri Düellosu" oyununda kullanıcının seçebileceği ligler —
 * SADECE ulusal ligler, Avrupa kupaları (Şampiyonlar Ligi, Avrupa Ligi,
 * Konferans Ligi, UEFA Süper Kupa) HARİÇ.
 *
 * Sebep: `team_market_value.leagueId` her takım için TEK bir değer tutar ve
 * senkron döngüsü her ligi (kupalar dahil) tarasa da, upsert `teamId` üzerine
 * "son yazan kazanır" şeklinde çalışır (bkz. lib/market-value-sync.ts). Kupa
 * ligleri FEATURED_LEAGUES dizisinde ulusal liglerden ÖNCE geldiği için,
 * ulusal lig senkronu her zaman en son çalışıp üzerine yazar — yani hiçbir
 * takım pratikte bir kupa ligine ait olarak SAKLANMAZ (DB'de doğrulandı: 4
 * kupa id'sinden hiçbiri teamMarketValue'da hiç görünmüyor). Kupa liglerini
 * seçilebilir yapmak, kullanıcıya her zaman "yeterli oyuncu verisi yok"
 * hatasıyla sonuçlanacak boş bir seçenek sunmak olurdu.
 *
 * Bu liste `country !== "Avrupa"` filtresiyle türetilir — FEATURED_LEAGUES'te
 * sadece 4 kupa yarışması "Avrupa" ülkesine sahiptir, tüm ulusal ligler
 * kendi ülkelerine sahiptir. Yeni bir kupa yarışması eklenirse otomatik
 * olarak dışlanır.
 */
export const DUEL_SELECTABLE_LEAGUES: FeaturedLeague[] = FEATURED_LEAGUES.filter((l) => l.country !== "Avrupa")

/** `DUEL_SELECTABLE_LEAGUES`'ten türetilen id listesi. */
export const DUEL_SELECTABLE_LEAGUE_IDS: number[] = DUEL_SELECTABLE_LEAGUES.map((l) => l.id)
