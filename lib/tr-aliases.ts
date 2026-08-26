import type { Fixture } from "./types"
import { normalizeTR } from "./search/text-normalize"

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
  "nicaragua": "Nikaragua",
  "belize": "Belize",
  "haiti": "Haiti",
  "dominican republic": "Dominik Cumhuriyeti",
  "puerto rico": "Porto Riko",
  "jamaica": "Jamaika",
  "trinidad and tobago": "Trinidad ve Tobago",
  "barbados": "Barbados",
  "guyana": "Guyana",
  "suriname": "Surinam",
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
}

/** Verilen İngilizce ülke adını Türkçe görüntüleme adına çevirir.
 *  Büyük/küçük harf, tire ve fazladan boşluk farkını tolere eder.
 *  Eşleşme bulunamazsa orijinal değeri döndürür. */
export function toTurkishCountry(country: string): string {
  if (!country) return country
  // API bazen "Czech-Republic", "South-Korea", "El-Salvador" gibi tireli gönderir
  const key = country.toLowerCase().trim().replace(/-/g, " ")
  return COUNTRY_TR_DISPLAY[key] ?? country
}

// Ters harita: Türkçe görüntüleme adı (küçük harf) → İngilizce orijinal ad.
// api-football.ts gibi veri katmanları ülke adlarını istemciye ulaşmadan önce
// zaten Türkçeye çevirdiği için, İngilizce arayüzde göstermek amacıyla bu
// dönüşümü geri almak gerekiyor.
const COUNTRY_EN_DISPLAY: Record<string, string> = Object.entries(COUNTRY_TR_DISPLAY).reduce(
  (acc, [en, tr]) => {
    acc[tr.toLowerCase()] = en.replace(/\b\w/g, (c) => c.toUpperCase())
    return acc
  },
  {} as Record<string, string>,
)

/** Ülke adını verilen dile göre görüntüleme adına çevirir.
 *  Veri katmanından gelen değer zaten Türkçe olduğundan, "en" için ters
 *  eşleme yapılır; "tr" için değer olduğu gibi döndürülür. */
export function toDisplayCountry(country: string, locale: "tr" | "en"): string {
  if (!country) return country
  if (locale === "tr") return country
  const key = country.toLowerCase().trim()
  return COUNTRY_EN_DISPLAY[key] ?? country
}

// Veri katmanında saklanan ülke adı (normalize edilmiş Türkçe) → İngilizce
// karşılığının normalize edilmiş hali. Arama kutularında kullanıcı arayüz
// dili İngilizce olsa da "Türkiye" yerine "Turkey" yazarak arama yapabilsin
// diye kullanılır.
const COUNTRY_EN_NORM_BY_TR_NORM: Record<string, string> = Object.entries(COUNTRY_TR_DISPLAY).reduce(
  (acc, [en, tr]) => {
    acc[normalizeTR(tr)] = normalizeTR(en)
    return acc
  },
  {} as Record<string, string>,
)

/** Saklanan (Türkçe) ülke adının, kullanıcının hangi dilde yazdığına
 *  bakılmaksızın arama sorgusuyla eşleşip eşleşmediğini kontrol eder.
 *  Örn: countryTR="Türkiye", qNorm=normalizeTR("Turkey") → true. */
export function countryMatchesQuery(countryTR: string, qNorm: string): boolean {
  if (!countryTR || !qNorm) return false
  const trNorm = normalizeTR(countryTR)
  if (trNorm.includes(qNorm)) return true
  const enNorm = COUNTRY_EN_NORM_BY_TR_NORM[trNorm]
  return enNorm ? enNorm.includes(qNorm) : false
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

  const country = f.league.country.toLowerCase().replace(/-/g, " ")
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
