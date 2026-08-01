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
  romania: "romanya",
  ireland: "irlanda",
  "saudi-arabia": "suudi arabistan",
  japan: "japonya",
  mexico: "meksika",
  world: "dünya",
}

// Map İngilizce ülke adı → görüntülenecek Türkçe karşılık
const COUNTRY_TR_DISPLAY: Record<string, string> = {
  England: "İngiltere",
  Spain: "İspanya",
  Germany: "Almanya",
  Italy: "İtalya",
  France: "Fransa",
  Netherlands: "Hollanda",
  Portugal: "Portekiz",
  Turkey: "Türkiye",
  Belgium: "Belçika",
  Scotland: "İskoçya",
  Greece: "Yunanistan",
  Russia: "Rusya",
  Brazil: "Brezilya",
  Argentina: "Arjantin",
  USA: "ABD",
  Austria: "Avusturya",
  Switzerland: "İsviçre",
  Denmark: "Danimarka",
  Sweden: "İsveç",
  Norway: "Norveç",
  Poland: "Polonya",
  Ukraine: "Ukrayna",
  Croatia: "Hırvatistan",
  Serbia: "Sırbistan",
  "Czech Republic": "Çekya",
  Romania: "Romanya",
  Ireland: "İrlanda",
  "Saudi Arabia": "Suudi Arabistan",
  Japan: "Japonya",
  Mexico: "Meksika",
  World: "Dünya",
  Europe: "Avrupa",
}

/** Verilen İngilizce ülke adını Türkçe görüntüleme adına çevirir.
 *  Eşleşme bulunamazsa orijinal değeri döndürür. */
export function toTurkishCountry(country: string): string {
  return COUNTRY_TR_DISPLAY[country] ?? country
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
