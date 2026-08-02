import type { Fixture } from "./types"

// Turkish aliases for the English country/league names that API-Football
// returns, so users can search "Almanya" and match "Germany", or
// "Şampiyonlar Ligi" and match "Champions League".

const COUNTRY_ALIASES: Record<string, string> = {
  england: "ingiltere",
  spain: "ispanya",
  germany: "almanya",
  italy: "italya",
  france: "fransa",
  netherlands: "hollanda",
  portugal: "portekiz",
  turkey: "turkiye türkiye",
  belgium: "belçika",
  scotland: "iskoçya",
  greece: "yunanistan",
  russia: "rusya",
  brazil: "brezilya",
  argentina: "arjantin",
  usa: "abd amerika",
  austria: "avusturya",
  switzerland: "isviçre",
  denmark: "danimarka",
  sweden: "isveç",
  norway: "norveç",
  poland: "polonya",
  ukraine: "ukrayna",
  croatia: "hırvatistan",
  serbia: "sırbistan",
  "czech-republic": "çekya çek cumhuriyeti",
  "czech republic": "çekya çek cumhuriyeti",
  "czechia": "çekya çek cumhuriyeti",
  romania: "romanya",
  ireland: "irlanda",
  "saudi-arabia": "suudi arabistan",
  japan: "japonya",
  mexico: "meksika",
  world: "dünya",
}

// Map İngilizce ülke adı → görüntülenecek Türkçe karşılık
// Anahtarlar küçük harfle saklanıyor; arama sırasında normalize ediliyor.
const COUNTRY_TR_DISPLAY: Record<string, string> = {
  // Avrupa
  "england": "İngiltere",
  "spain": "İspanya",
  "germany": "Almanya",
  "italy": "İtalya",
  "france": "Fransa",
  "netherlands": "Hollanda",
  "portugal": "Portekiz",
  "turkey": "Türkiye",
  "belgium": "Belçika",
  "scotland": "İskoçya",
  "greece": "Yunanistan",
  "russia": "Rusya",
  "austria": "Avusturya",
  "switzerland": "İsviçre",
  "denmark": "Danimarka",
  "sweden": "İsveç",
  "norway": "Norveç",
  "poland": "Polonya",
  "ukraine": "Ukrayna",
  "croatia": "Hırvatistan",
  "serbia": "Sırbistan",
  "czech republic": "Çekya",
  "czechia": "Çekya",
  "romania": "Romanya",
  "ireland": "İrlanda",
  "hungary": "Macaristan",
  "slovakia": "Slovakya",
  "slovenia": "Slovenya",
  "bulgaria": "Bulgaristan",
  "finland": "Finlandiya",
  "iceland": "İzlanda",
  "wales": "Galler",
  "northern ireland": "Kuzey İrlanda",
  "albania": "Arnavutluk",
  "armenia": "Ermenistan",
  "azerbaijan": "Azerbaycan",
  "belarus": "Beyaz Rusya",
  "bosnia": "Bosna-Hersek",
  "bosnia and herzegovina": "Bosna-Hersek",
  "cyprus": "Kıbrıs",
  "estonia": "Estonya",
  "faroe islands": "Faroe Adaları",
  "georgia": "Gürcistan",
  "gibraltar": "Cebelitarık",
  "kazakhstan": "Kazakistan",
  "kosovo": "Kosova",
  "latvia": "Letonya",
  "liechtenstein": "Lihtenştayn",
  "lithuania": "Litvanya",
  "luxembourg": "Lüksemburg",
  "malta": "Malta",
  "moldova": "Moldova",
  "montenegro": "Karadağ",
  "north macedonia": "Kuzey Makedonya",
  "san marino": "San Marino",
  "andorra": "Andorra",
  "monaco": "Monako",
  "macedonia": "Kuzey Makedonya",
  // Kuzey Amerika
  "usa": "ABD",
  "united states": "ABD",
  "mexico": "Meksika",
  "canada": "Kanada",
  "costa rica": "Kosta Rika",
  "honduras": "Honduras",
  "guatemala": "Guatemala",
  "panama": "Panama",
  "el salvador": "El Salvador",
  "jamaica": "Jamaika",
  "trinidad and tobago": "Trinidad ve Tobago",
  "cuba": "Küba",
  // Güney Amerika
  "brazil": "Brezilya",
  "argentina": "Arjantin",
  "colombia": "Kolombiya",
  "chile": "Şili",
  "peru": "Peru",
  "venezuela": "Venezuela",
  "ecuador": "Ekvador",
  "uruguay": "Uruguay",
  "paraguay": "Paraguay",
  "bolivia": "Bolivya",
  // Asya
  "japan": "Japonya",
  "china": "Çin",
  "south korea": "Güney Kore",
  "saudi arabia": "Suudi Arabistan",
  "iran": "İran",
  "iraq": "Irak",
  "israel": "İsrail",
  "qatar": "Katar",
  "uae": "Birleşik Arap Emirlikleri",
  "united arab emirates": "Birleşik Arap Emirlikleri",
  "kuwait": "Kuveyt",
  "bahrain": "Bahreyn",
  "jordan": "Ürdün",
  "lebanon": "Lübnan",
  "syria": "Suriye",
  "india": "Hindistan",
  "thailand": "Tayland",
  "vietnam": "Vietnam",
  "indonesia": "Endonezya",
  "malaysia": "Malezya",
  "australia": "Avustralya",
  "uzbekistan": "Özbekistan",
  "tajikistan": "Tacikistan",
  "kyrgyzstan": "Kırgızistan",
  "turkmenistan": "Türkmenistan",
  "afghanistan": "Afganistan",
  "pakistan": "Pakistan",
  "nepal": "Nepal",
  "sri lanka": "Sri Lanka",
  "myanmar": "Myanmar",
  "philippines": "Filipinler",
  "singapore": "Singapur",
  "hong kong": "Hong Kong",
  "taiwan": "Tayvan",
  "north korea": "Kuzey Kore",
  "oman": "Umman",
  "yemen": "Yemen",
  "palestine": "Filistin",
  // Afrika
  "nigeria": "Nijerya",
  "ghana": "Gana",
  "egypt": "Mısır",
  "morocco": "Fas",
  "senegal": "Senegal",
  "cameroon": "Kamerun",
  "ivory coast": "Fildişi Sahili",
  "côte d'ivoire": "Fildişi Sahili",
  "mali": "Mali",
  "algeria": "Cezayir",
  "tunisia": "Tunus",
  "south africa": "Güney Afrika",
  "kenya": "Kenya",
  "ethiopia": "Etiyopya",
  "tanzania": "Tanzanya",
  "uganda": "Uganda",
  "zimbabwe": "Zimbabve",
  "zambia": "Zambiya",
  "angola": "Angola",
  "mozambique": "Mozambik",
  "namibia": "Namibya",
  "botswana": "Botsvana",
  "libya": "Libya",
  "sudan": "Sudan",
  "somalia": "Somali",
  "congo": "Kongo",
  "dr congo": "Demokratik Kongo Cumhuriyeti",
  "democratic republic of the congo": "Demokratik Kongo Cumhuriyeti",
  "rwanda": "Ruanda",
  "burkina faso": "Burkina Faso",
  "guinea": "Gine",
  "zimbabwe": "Zimbabve",
  "sierra leone": "Sierra Leone",
  "liberia": "Liberya",
  "gabon": "Gabon",
  "benin": "Benin",
  "togo": "Togo",
  "niger": "Nijer",
  "chad": "Çad",
  "mauritania": "Moritanya",
  "eritrea": "Eritre",
  "djibouti": "Cibuti",
  // Diğer / Uluslararası
  "world": "Dünya",
  "europe": "Avrupa",
  "africa": "Afrika",
  "asia": "Asya",
  "south america": "Güney Amerika",
  "north america": "Kuzey Amerika",
  "oceania": "Okyanusya",
  // Azerbaycan'lı takımlar için özel (API "Azerbaijan" dönüyor)
  "azerbaijan": "Azerbaycan",
}

/** Verilen İngilizce ülke adını Türkçe görüntüleme adına çevirir.
 *  Büyük/küçük harf ve tire farkını tolere eder.
 *  Eşleşme bulunamazsa orijinal değeri döndürür. */
export function toTurkishCountry(country: string): string {
  if (!country) return country
  const key = country.toLowerCase().trim()
  return COUNTRY_TR_DISPLAY[key] ?? country
}

const LEAGUE_ALIASES: Array<{ match: string; tr: string }> = [
  { match: "champions league", tr: "şampiyonlar ligi" },
  { match: "europa league", tr: "avrupa ligi" },
  { match: "conference league", tr: "konferans ligi" },
  { match: "premier league", tr: "premier lig" },
  { match: "la liga", tr: "la liga ispanya ligi" },
  { match: "serie a", tr: "serie a italya ligi" },
  { match: "bundesliga", tr: "almanya ligi bundesliga" },
  { match: "ligue 1", tr: "fransa ligi ligue" },
  { match: "süper lig", tr: "süper lig türkiye ligi" },
  { match: "super lig", tr: "süper lig türkiye ligi" },
  { match: "eredivisie", tr: "hollanda ligi" },
  { match: "primeira liga", tr: "portekiz ligi" },
  { match: "world cup", tr: "dünya kupası" },
  { match: "euro", tr: "avrupa şampiyonası" },
  { match: "nations league", tr: "uluslar ligi" },
]

// Build a normalized, searchable haystack for a fixture that also contains the
// Turkish aliases of its country and league.
export function buildSearchIndex(f: Fixture): string {
  const parts = [f.home.name, f.away.name, f.league.name, f.league.country]
  const base = parts.join(" ").toLocaleLowerCase("tr-TR")

  const country = f.league.country.toLowerCase()
  const countryAlias = COUNTRY_ALIASES[country]
  if (countryAlias) parts.push(countryAlias)

  const leagueLower = f.league.name.toLowerCase()
  for (const { match, tr } of LEAGUE_ALIASES) {
    if (leagueLower.includes(match)) parts.push(tr)
  }

  // Team names can also be countries (national teams), so alias those too.
  for (const [en, tr] of Object.entries(COUNTRY_ALIASES)) {
    if (base.includes(en)) parts.push(tr)
  }

  return parts.join(" ").toLocaleLowerCase("tr-TR")
}
