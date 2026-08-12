import * as cheerio from "cheerio"
import { FEATURED_LEAGUE_IDS } from "./api-football"
import { toTurkishCountry } from "./tr-aliases"

// ---------------------------------------------------------------------------
// Transfermarkt scraping katmanı.
//
// Bu modül SADECE cron job (haftalık güncelleme) tarafından çağrılır.
// Uygulamanın kullanıcıya açık kısımları bu modülü asla import etmez —
// onlar lib/market-values.ts üzerinden veritabanından okur.
//
// Transfermarkt, URL'deki "slug" metnini önemsemiyor; sadece competition
// kodu (örn. TR1) ve takım/oyuncu id'si eşleşirse doğru sayfaya yönlendirir.
// Bu sayede her lig/takım için gerçek slug'ı bilmemize gerek yok.
// ---------------------------------------------------------------------------

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

const BASE_URL = "https://www.transfermarkt.com"

/** API-Football lig id'si -> Transfermarkt competition kodu. */
export const LEAGUE_TO_TRANSFERMARKT_CODE: Record<number, string> = {
  2: "CL", // Champions League
  3: "EL", // Europa League
  848: "UECL", // Conference League
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
}

/** Basit gecikme — Transfermarkt'a art arda çok hızlı istek atmamak için. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Tek bir sayfa isteği için zaman aşımı. Bu OLMADAN, Transfermarkt yanıt
 * vermeden bağlantıyı askıda tutarsa `fetch()` süresiz beklerdi — cron
 * zinciri hiçbir hata/log bırakmadan, serverless'in maxDuration (300s)
 * sınırında SESSİZCE öldürülene kadar tam olarak burada donardı (haftalık
 * lig döngüsünün rastgele bir takımda "sebepsizce" durmasının asıl kök
 * nedeni buydu). Zaman aşımı burada AbortController ile catch bloğuna
 * düşürülüyor, böylece aşağıdaki mevcut retry mantığı devreye giriyor.
 */
const FETCH_TIMEOUT_MS = 20_000

/**
 * Transfermarkt sayfasını indirir. Geçici ağ hatalarında (ve zaman
 * aşımlarında) birkaç kez tekrar dener. Kalıcı hatalarda (404 vb.) null
 * döner — bir sayfanın çekilememesi tüm işlemi durdurmamalı.
 */
async function fetchHtml(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
      })
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await sleep(500 * (attempt + 1))
          continue
        }
        console.warn(`[v0] Transfermarkt fetch başarısız (${res.status}): ${url}`)
        return null
      }
      return await res.text()
    } catch (err) {
      if (attempt < retries) {
        await sleep(500 * (attempt + 1))
        continue
      }
      console.warn(`[v0] Transfermarkt fetch hatası (zaman aşımı olabilir): ${url}`, err)
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }
  return null
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
 * Bir ligin (competition) takım listesini + toplam kadro piyasa değerini çeker.
 * API-Football lig id'si alır, LEAGUE_TO_TRANSFERMARKT_CODE üzerinden kodu bulur.
 */
export async function scrapeLeagueTeams(leagueId: number): Promise<ScrapedTeam[]> {
  const code = LEAGUE_TO_TRANSFERMARKT_CODE[leagueId]
  if (!code) {
    console.warn(`[v0] Lig id ${leagueId} için Transfermarkt kodu tanımlı değil, atlanıyor.`)
    return []
  }

  const url = `${BASE_URL}/wettbewerb/startseite/wettbewerb/${code}`
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const teams: ScrapedTeam[] = []

  // Lig sayfasında "compact" ve "detailed" görünüm için aynı içerikte iki
  // table.items render edilir (biri CSS ile gizli). Sadece ilkini kullan,
  // yoksa her takım iki kez sayılır.
  $("table.items").first().find("> tbody > tr").each((_, el) => {
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

  return teams
}

/**
 * Bir takımın kadrosundaki oyuncuları ve piyasa değerlerini çeker.
 * transfermarktTeamId, scrapeLeagueTeams() çıktısından gelir.
 */
export async function scrapeTeamSquad(transfermarktTeamId: string): Promise<ScrapedPlayer[]> {
  const url = `${BASE_URL}/x/kader/verein/${transfermarktTeamId}/plus/1`
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const players: ScrapedPlayer[] = []

  $("table.items").first().find("> tbody > tr").each((_, el) => {
    const row = $(el)
    const nameLink = row.find("td.posrela table.inline-table a").first()
    const name = nameLink.text().trim()
    const transfermarktId = extractIdFromHref(nameLink.attr("href"), "spieler")
    if (!name || !transfermarktId) return

    const valueCell = row.find("td.rechts.hauptlink").last()
    const valueEur = parseMarketValueToEur(valueCell.text())

    players.push({ transfermarktId, name, valueEur })
  })

  return players
}

/**
 * Bir Transfermarkt takımının ülkesini (oynadığı lig ülkesi) döndürür.
 * SADECE piyasa değeri manuel gözden geçirme kuyruğu (review queue) için
 * kullanılır — belirsiz eşleşmelerde admin'e karşılaştırma imkanı verir.
 * Otomatik eşleşen takımlar için çağrılmaz.
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
 * döndürür. SADECE piyasa değeri manuel gözden geçirme kuyruğu için
 * kullanılır (bkz. scrapeTeamCountry).
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

/** Cron job'ın sırayla çağıracağı, tüm desteklenen 23 ligin id listesi. */
export const SCRAPABLE_LEAGUE_IDS: number[] = FEATURED_LEAGUE_IDS
