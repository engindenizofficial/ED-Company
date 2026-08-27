import * as cheerio from "cheerio"
import { FEATURED_LEAGUE_IDS } from "./api-football"
import { toTurkishCountry } from "./tr-aliases"

// ---------------------------------------------------------------------------
// Transfermarkt scraping katmanı.
//
// Bu modül SADECE admin tarafından tetiklenen tarama zinciri (bkz.
// lib/market-value-cron-run.ts) tarafından çağrılır. Uygulamanın kullanıcıya
// açık kısımları bu modülü asla import etmez — onlar lib/market-values.ts
// üzerinden veritabanından okur.
//
// Transfermarkt, URL'deki "slug" metnini önemsemiyor; sadece competition
// kodu (örn. TR1) ve takım/oyuncu id'si eşleşirse doğru sayfaya yönlendirir.
// Bu sayede her lig/takım için gerçek slug'ı bilmemize gerek yok.
//
// Basit ve öngörülebilir model: her istek arasında SABİT 3 saniye beklenir,
// hiçbir retry/backoff/oturum kalıcılığı yoktur. Bir istek başarısız olursa
// (403/429/5xx/ağ hatası) doğrudan hata fırlatılır — üst katman (bkz.
// lib/market-value-cron-run.ts) zincirin bir sonraki QStash tetiklemesinde
// aynı adımı otomatik olarak tekrar dener.
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.transfermarkt.com"

/** Tüm istekler için tek, sabit bir masaüstü tarayıcı User-Agent'ı. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

/** Sayfa istekleri arasında beklenen sabit süre (ms). */
export const TM_REQUEST_DELAY_MS = 3000

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** API-Football lig id'si -> Transfermarkt competition kodu. */
export const LEAGUE_TO_TRANSFERMARKT_CODE: Record<number, string> = {
  2: "CL", // Champions League
  3: "EL", // Europa League
  848: "UECL", // Conference League
  531: "USC", // UEFA Super Cup
  39: "GB1", // Premier League
  140: "ES1", // La Liga
  135: "IT1", // Serie A
  78: "L1", // Bundesliga
  61: "FR1", // Ligue 1
  94: "PO1", // Primeira Liga
  203: "TR1", // Süper Lig
  88: "NL1", // Eredivisie
  235: "RU1", // Premier Liga (Russia)
  144: "BE1", // Jupiler Pro League
  197: "GR1", // Super League (Greece)
  333: "UKR1", // Ukrainian Premier League
  345: "TS1", // Czech Liga
  119: "DK1", // Superliga (Denmark)
  179: "SC1", // Scottish Premiership
  106: "PL1", // Ekstraklasa
  103: "NO1", // Eliteserien
  218: "A1", // Bundesliga (Austria)
  207: "C1", // Super League (Switzerland)
  286: "SER1", // Super Liga (Serbia)
  307: "SA1", // Saudi Pro League
  253: "MLS1", // Major League Soccer
  128: "AR1N", // Liga Profesional Argentina
}

// Derleme zamanında FEATURED_LEAGUE_IDS ile bu haritanın senkron kalmasını
// garantiler — yeni bir lig eklenip kod haritası güncellenmezse fark edilir.
const missing = FEATURED_LEAGUE_IDS.filter((id) => !(id in LEAGUE_TO_TRANSFERMARKT_CODE))
if (missing.length > 0) {
  console.warn(
    `[v0] Transfermarkt kod eşleşmesi eksik olan lig id'leri: ${missing.join(", ")}. ` +
      "lib/transfermarkt-scraper.ts içindeki LEAGUE_TO_TRANSFERMARKT_CODE'u güncelle.",
  )
}

export interface ScrapedTeam {
  transfermarktId: string
  name: string
  totalValueEur: number | null
}

export interface ScrapedPlayer {
  transfermarktId: string
  name: string
  valueEur: number | null
  /** Kadro satırındaki bayrak sütunundan okunan uyruk — ekstra istek gerekmez. */
  nationality: string | null
}

export interface ScrapedLeagueResult {
  teams: ScrapedTeam[]
  leagueName: string | null
  leagueCountry: string | null
}

/**
 * Transfermarkt sayfasını indirir. SADECE 404 (sayfa gerçekten yok) "veri
 * yok" sayılıp null döner. Diğer her durumda (403/429/5xx/ağ hatası) hata
 * FIRLATILIR — hiçbir retry/backoff veya ek süre sınırı uygulanmaz. Üst
 * katman hatayı kaydeder; dakikalık QStash gözetmeni aynı adımı yeniden
 * tetikler.
 */
async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    redirect: "follow",
  })

  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  return res.text()
}

/**
 * "€1.47bn", "€47.43m", "€850k", "-" gibi Transfermarkt para birimi
 * gösterimini tam euro değerine (integer) çevirir.
 */
export function parseMarketValueToEur(raw: string | null | undefined): number | null {
  if (!raw) return null
  const text = raw.trim()
  const match = text.match(/€\s*([\d.,]+)\s*(bn|m|k)?/i)
  if (!match) return null
  const numeric = Number.parseFloat(match[1].replace(",", "."))
  if (!Number.isFinite(numeric)) return null
  const unit = (match[2] ?? "").toLowerCase()
  const multiplier = unit === "bn" ? 1_000_000_000 : unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1
  return Math.round(numeric * multiplier)
}

/** Transfermarkt href'inden verein/spieler id'sini çıkarır, örn. ".../verein/281/..." -> "281" */
function extractIdFromHref(href: string | undefined, kind: "verein" | "spieler"): string | null {
  if (!href) return null
  const match = href.match(new RegExp(`/${kind}/(\\d+)`))
  return match ? match[1] : null
}

/**
 * Bir ligin (competition) takım listesini + toplam kadro piyasa değerini,
 * lig adını ve (varsa) ülkesini çeker. API-Football lig id'si alır,
 * LEAGUE_TO_TRANSFERMARKT_CODE üzerinden kodu bulur.
 */
export async function scrapeLeagueTeams(leagueId: number): Promise<ScrapedLeagueResult> {
  const code = LEAGUE_TO_TRANSFERMARKT_CODE[leagueId]
  if (!code) {
    console.warn(`[v0] Lig id ${leagueId} için Transfermarkt kodu tanımlı değil, atlanıyor.`)
    return { teams: [], leagueName: null, leagueCountry: null }
  }

  const url = `${BASE_URL}/wettbewerb/startseite/wettbewerb/${code}`
  const html = await fetchHtml(url)
  if (!html) return { teams: [], leagueName: null, leagueCountry: null }

  const $ = cheerio.load(html)
  const teams: ScrapedTeam[] = []

  // Lig sayfasında "compact" ve "detailed" görünüm için aynı içerikte iki
  // table.items render edilir (biri CSS ile gizli). Sadece ilkini kullan,
  // yoksa her takım iki kez sayılır.
  $("table.items")
    .first()
    .find("> tbody > tr")
    .each((_, el) => {
      const row = $(el)
      const nameLink = row.find("td.hauptlink.no-border-links a[title]").first()
      const name = nameLink.attr("title")?.trim()
      const transfermarktId = extractIdFromHref(nameLink.attr("href"), "verein")
      if (!name || !transfermarktId) return

      // Toplam piyasa değeri her zaman son "rechts" hücresindedir.
      const lastValueCell = row.find("td.rechts").last()
      const totalValueEur = parseMarketValueToEur(lastValueCell.text())

      teams.push({ transfermarktId, name, totalValueEur })
    })

  // Lig adı + ülkesi sayfanın üst bilgi bloğundan (.data-header) okunur.
  const leagueNameRaw = $(".data-header__headline-wrapper").first().text().trim()
  const leagueName = leagueNameRaw.length > 0 ? leagueNameRaw.replace(/\s+/g, " ") : null
  const leagueFlag = $(".data-header img.data-header__box__flag, .data-header img.flaggenrahmen").first()
  const leagueCountryRaw = (leagueFlag.attr("title") ?? leagueFlag.attr("alt"))?.trim()
  const leagueCountry = leagueCountryRaw ? toTurkishCountry(leagueCountryRaw) : null

  return { teams, leagueName, leagueCountry }
}

/**
 * Bir takımın kadrosundaki oyuncuları, piyasa değerlerini ve uyruklarını
 * çeker. transfermarktTeamId, scrapeLeagueTeams() çıktısından gelir. Uyruk,
 * aynı kadro satırındaki bayrak sütunundan okunur — bunun için oyuncu
 * başına EKSTRA bir HTTP isteği açılmaz.
 */
export async function scrapeTeamSquad(transfermarktTeamId: string): Promise<ScrapedPlayer[]> {
  const url = `${BASE_URL}/x/kader/verein/${transfermarktTeamId}/plus/1`
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const players: ScrapedPlayer[] = []

  $("table.items")
    .first()
    .find("> tbody > tr")
    .each((_, el) => {
      const row = $(el)
      const nameLink = row.find("td.posrela table.inline-table a").first()
      const name = nameLink.text().trim()
      const transfermarktId = extractIdFromHref(nameLink.attr("href"), "spieler")
      if (!name || !transfermarktId) return

      const valueCell = row.find("td.rechts.hauptlink").last()
      const valueEur = parseMarketValueToEur(valueCell.text())

      // Kadro tablosunda uyruk bayrağı standart olarak "zentriert" (ortalı)
      // bir hücrede img.flaggenrahmen olarak yer alır — birden fazla uyruk
      // varsa ilk bayrak ana uyruk sayılır.
      const nationalityRaw = row.find("td.zentriert img.flaggenrahmen").first().attr("title")?.trim()
      const nationality = nationalityRaw ? toTurkishCountry(nationalityRaw) : null

      players.push({ transfermarktId, name, valueEur, nationality })
    })

  return players
}

/**
 * Bir Transfermarkt takımının ülkesini (oynadığı lig ülkesi) döndürür.
 * Fallback olarak kullanılır — kupa liglerinde takımlar farklı ülkelerden
 * geldiği için her zaman çağrılır; lig sayfasında ayrıca ülke bilgisi yoktur.
 */
export async function scrapeTeamCountry(transfermarktTeamId: string): Promise<string | null> {
  const url = `${BASE_URL}/x/startseite/verein/${transfermarktTeamId}`
  const html = await fetchHtml(url)
  if (!html) return null

  const $ = cheerio.load(html)
  const flag = $(".data-header__club-info img.flaggenrahmen").first()
  const country = flag.attr("title")?.trim()
  // Transfermarkt bayrak title'ları İngilizce geliyor; API-Football tarafı
  // Türkçeleştirildiği için admin karşılaştırmasında ikisi tutarlı görünsün.
  return country ? toTurkishCountry(country) : null
}

/**
 * Bir Transfermarkt oyuncusunun uyruğunu (birden fazlaysa "/" ile ayrılmış)
 * döndürür. SADECE `scrapeTeamSquad`'ın satırdan uyruk bulamadığı (nadir)
 * durumlarda fallback olarak çağrılır.
 */
export async function scrapePlayerNationality(transfermarktPlayerId: string): Promise<string | null> {
  const url = `${BASE_URL}/x/profil/spieler/${transfermarktPlayerId}`
  const html = await fetchHtml(url)
  if (!html) return null

  const $ = cheerio.load(html)
  const flags = $('span[itemprop="nationality"] img.flaggenrahmen')
  const countries = flags
    .map((_, el) => $(el).attr("title")?.trim())
    .get()
    .filter((c): c is string => Boolean(c))
    .map(toTurkishCountry)
  return countries.length > 0 ? countries.join(" / ") : null
}

export interface ScrapedPlayerPosition {
  /** Transfermarkt'ın ham "Main position:" metni, örn. "Defensive Midfield" */
  mainPosition: string | null
  /** Transfermarkt'ın ham "Other position:" metinleri (birden fazla olabilir) */
  secondaryPositions: string[]
}

/**
 * Bir Transfermarkt oyuncu profilinden ana/yan mevki bilgisini çeker.
 * SADECE arka planda kademeli çalışan mevki backfill'i (bkz.
 * lib/player-position-sync.ts) tarafından çağrılır — piyasa değeri sistemi
 * bu fonksiyonu kullanmaz.
 *
 * Profil sayfasındaki ilgili blok tek bir <dl> içinde sıralı dt/dd
 * çiftlerinden oluşur: `<dt>Main position:</dt><dd>...</dd>` ardından
 * `<dt>Other position:</dt>` ve onu takip eden bir veya daha fazla
 * `<dd class="detail-position__position">` elemanı. Sıra korunarak
 * dt metnine göre hangi listeye ait olduğu belirlenir.
 */
export async function scrapePlayerPosition(transfermarktPlayerId: string): Promise<ScrapedPlayerPosition | null> {
  const url = `${BASE_URL}/x/profil/spieler/${transfermarktPlayerId}`
  const html = await fetchHtml(url)
  if (!html) return null

  const $ = cheerio.load(html)
  let mainPosition: string | null = null
  const secondaryPositions: string[] = []
  let currentLabel: "main" | "other" | null = null

  $(".detail-position dt, .detail-position dd").each((_, el) => {
    const $el = $(el)
    const tag = el.tagName?.toLowerCase()
    if (tag === "dt") {
      const label = $el.text().trim().toLowerCase()
      currentLabel = label.startsWith("main position") ? "main" : label.startsWith("other position") ? "other" : null
      return
    }
    if (tag === "dd" && $el.hasClass("detail-position__position")) {
      const text = $el.text().trim()
      if (!text) return
      if (currentLabel === "main" && !mainPosition) mainPosition = text
      else if (currentLabel === "other") secondaryPositions.push(text)
    }
  })

  if (!mainPosition && secondaryPositions.length === 0) return null
  return { mainPosition, secondaryPositions }
}

/** Cron job'ın sırayla çağıracağı, tüm desteklenen ligin id listesi. */
export const SCRAPABLE_LEAGUE_IDS: number[] = FEATURED_LEAGUE_IDS
