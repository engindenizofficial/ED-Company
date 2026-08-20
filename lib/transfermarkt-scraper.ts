import * as cheerio from "cheerio"
import { FEATURED_LEAGUE_IDS } from "./api-football"
import { toTurkishCountry } from "./tr-aliases"
import { getTmSession, setTmSession, getTmBlockLevel, bumpTmBlockLevel } from "./redis"

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
//
// ÖNCELİK: kullanıcının açık talebiyle bu modülde HIZ'dan önce "hiç blok
// yememe" önceliklidir. Aşağıdaki mekanizmalar (kalıcı oturum kimliği,
// soft-block tespiti, adaptif gecikme) bu yüzden var — hiçbiri "asla blok
// yenmez" garantisi VERMEZ (Transfermarkt'ın bot koruması bizim
// kontrolümüzde değil), ama blok riskini gözle görülür şekilde azaltmayı
// hedefler.
// ---------------------------------------------------------------------------

/**
 * Gerçekçi masaüstü tarayıcı User-Agent'ları. Her invocation için (Redis'te
 * kayıtlı bir oturum yoksa) rastgele biri seçilir ve o oturumun ÇEREZİYLE
 * BİRLİKTE sabitlenir (bkz. ensureIdentityHydrated). Aynı çerezle her istekte
 * farklı bir User-Agent göndermek — yani "kimlik" değişse bile "oturum" aynı
 * kalıyormuş gibi davranmak — bazı bot korumalarında hiç çerez göndermemekten
 * bile daha güçlü bir şüphe sinyalidir; bu yüzden UA request bazında DEĞİL,
 * oturum bazında seçilir.
 */
const USER_AGENT_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

const BASE_URL = "https://www.transfermarkt.com"

// Tüm modül boyunca (yani tek bir invocation içinde) TEK bir çerez kutusu +
// User-Agent paylaşılıyor. Serverless her invocation'da module state'i
// SIFIRLAR — öncesinde bu, her yeni cron çağrısının Cloudflare'a "yepyeni bir
// ziyaretçi" gibi görünmesine yol açıyordu. Şimdi bu kimlik Redis'e kalıcı
// yazılıyor (bkz. ensureIdentityHydrated/persistIdentity) ve bir sonraki
// invocation'da geri yükleniyor — art arda gelen cron çağrıları da (aynı
// ~20dk'lık pencere içinde) "devam eden aynı oturum" gibi görünür.
let sharedCookieJar = ""
let sharedUserAgent = USER_AGENT_POOL[0]
let identityHydrated = false

/** İlk fetchHtml çağrısında Redis'ten kalıcı oturumu (çerez + UA) yükler; yoksa yeni bir kimlik seçip Redis'e yazar. */
async function ensureIdentityHydrated(): Promise<void> {
  if (identityHydrated) return
  identityHydrated = true
  const session = await getTmSession()
  if (session?.cookieJar) sharedCookieJar = session.cookieJar
  if (session?.userAgent) {
    sharedUserAgent = session.userAgent
  } else {
    sharedUserAgent = USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)]
    await persistIdentity()
  }
}

async function persistIdentity(): Promise<void> {
  await setTmSession({ cookieJar: sharedCookieJar, userAgent: sharedUserAgent })
}

function mergeCookiesFromResponse(res: Response) {
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) return
  const incoming = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
  const jar = new Map<string, string>()
  for (const c of sharedCookieJar.split("; ")) {
    const [k, v] = c.split("=")
    if (k && v) jar.set(k, v)
  }
  for (const c of incoming) {
    const [k, v] = c.split("=")
    if (k && v) jar.set(k, v)
  }
  sharedCookieJar = Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
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
 *
 * 8s olarak ayarlandı (önceden 20s): gerçek sayfa yanıtları normalde 1-2s
 * içinde gelir, bu yüzden 20s'lik bekleme pratikte sadece "askıda kalan"
 * isteklerde worst-case süreyi gereksiz yere şişiriyordu (bir oyuncu 20s
 * timeout + retry'da başarı ~25s'ye çıkıyordu). 8s hâlâ yavaş ama gerçek
 * bir sunucu yanıtı için yeterli pay bırakırken worst-case'i büyük ölçüde
 * kısaltıyor.
 */
const FETCH_TIMEOUT_MS = 8_000

/**
 * Transfermarkt'ın rate-limit / bot koruması (403 Forbidden, 429 Too Many
 * Requests) ve geçici sunucu hataları (5xx) için kullanılan, giderek uzayan
 * bekleme süreleri. Transfermarkt'ın bot engelleri genelde birkaç saniyelik
 * bir 5xx hiçbirinden daha uzun sürdüğü için buradaki gecikmeler kasıtlı
 * olarak daha büyük — ama çok agresif küçültmek Transfermarkt'ı tekrar
 * tekrar hızlı çarpıp tüm sistemin bloklanmasına yol açabileceği için
 * ölçülü tutuldu (1.5s / 4s / 10s).
 */
const BLOCKING_RETRY_DELAYS_MS = [1500, 4000, 10000]

/**
 * Transfermarkt bazen 403/429/5xx DÖNMEDEN, düz 200 ile bir Cloudflare
 * "meydan okuma" (challenge) sayfası gönderir — gerçek içerik yerine
 * JS/captcha bekleyen ara sayfa. Önceden bu durum fark edilmiyordu: `res.ok`
 * true olduğu için fonksiyon bu sahte içeriği "başarılı" sayıp döndürüyordu,
 * cheerio de içinde aradığı elementleri bulamayınca sessizce "0 sonuç" ile
 * devam ediyordu — yani bir blok, "veri yok" gibi yorumlanabiliyordu.
 * Burada bilinen meydan okuma imzaları + anormal küçük yanıt boyutu ile bu
 * durum "soft block" olarak yakalanıp normal 403/429 gibi retry+backoff'a
 * düşürülüyor.
 */
const BLOCK_PAGE_MARKERS = [
  "Attention Required! | Cloudflare",
  "cf-browser-verification",
  "Checking your browser before accessing",
  "Just a moment...",
  "cf_chl_opat",
  "id=\"challenge-form\"",
]

function looksLikeBlockPage(html: string): boolean {
  // Gerçek Transfermarkt sayfaları (lig/takım/oyuncu) her zaman birkaç KB'ın
  // üzerindedir; bu kadar kısa bir yanıt normal bir sayfa olamaz.
  if (html.length < 400) return true
  return BLOCK_PAGE_MARKERS.some((marker) => html.includes(marker))
}

/**
 * Blok/timeout sinyali görüldüğünde çağrılır: sadece o anki denemeyi
 * etkilemez, Redis'teki paylaşımlı blok seviyesini artırır — bu seviye
 * lib/player-position-sync.ts ve lib/market-value-sync.ts'deki istekler
 * arası beklemeleri (bkz. getAdaptiveDelayMs) otomatik olarak uzatır. Yani
 * bir çağrı bloklanırsa, ondan sonraki TÜM istekler (farklı bir invocation'da
 * olsa bile, ~15dk içinde) daha temkinli hale gelir.
 */
async function onBlockSignal(): Promise<void> {
  await bumpTmBlockLevel()
}

/**
 * İstekler arası bekleme süresini hesaplar. `baseMs` çağıranın istediği
 * taban gecikmedir; buna (a) son ~15dk içinde görülen blok sinyaline göre
 * kademeli bir ek (seviye × 2s) ve (b) sabit aralık deseninin kendisinin bir
 * bot imzası olmaması için ±500ms rastgele jitter eklenir.
 *
 * DÜRÜST UYARI: Bu hesaplama blok riskini azaltmayı hedefler, "asla blok
 * yenmez" garantisi vermez — Transfermarkt'ın bot koruma algoritması bizim
 * kontrolümüzde değil.
 */
export async function getAdaptiveDelayMs(baseMs: number): Promise<number> {
  const level = await getTmBlockLevel()
  const escalation = level * 2000
  const jitter = Math.floor(Math.random() * 1000) - 500
  return Math.max(1000, baseMs + escalation + jitter)
}

/**
 * Transfermarkt sayfasını indirir. Geçici ağ hatalarında, 5xx'lerde,
 * rate-limit/bot koruması yanıtlarında (403/429) ve "soft block" (200 ama
 * meydan okuma sayfası) durumlarında giderek uzayan beklemelerle birkaç kez
 * tekrar dener (429 için "Retry-After" header'ı varsa ona uyar).
 *
 * ÖNEMLİ — SADECE 404 (sayfa gerçekten yok) "veri yok" sayılıp null döner.
 * Tüm denemeler tükendiğinde diğer her durumda (403/429/5xx/soft-block/ağ
 * hatası) bu fonksiyon artık sessizce null DÖNMEZ, hata FIRLATIR. Önceden
 * null dönmesi, çağıran tarafın (scrapeLeagueTeams/scrapeTeamSquad) bunu "bu
 * ligde/takımda hiç oyuncu/takım yok" ile ayırt edememesine ve cron'un
 * bloklanan bir ligi sessizce "başarılı, 0 eşleşme" olarak işaretlemesine yol
 * açıyordu — hiçbir hata görünmediği için sorun fark edilemiyordu. Artık bu
 * hata lib/market-value-sync.ts -> prepareLeagueTeamSync üzerinden
 * lib/market-value-cron-run.ts -> prepareLeagueWithRetries'e kadar
 * propagate olur; o katman ligi yeniden dener ve son çare olarak "failed"
 * işaretleyip admin panelindeki "X lig başarısız" göstergesine yansıtır.
 */
async function fetchHtml(url: string, retries = BLOCKING_RETRY_DELAYS_MS.length): Promise<string | null> {
  await ensureIdentityHydrated()
  let lastError: string | null = null
  // Bir tek fetchHtml çağrısı içindeki 3 retry denemesi TEK bir gerçek olay
  // sayılmalı — öncesinde onBlockSignal() her denemede ayrı ayrı çağrılıyordu,
  // yani tek bir bloklanan oyuncu (3 retry tükenince) blok seviyesini bir
  // çağrıda 3 birden artırıp anında üst sınıra (5, +10s) sıçratıyordu. Bu da
  // "önce ~15 oyuncu sorunsuz gidiyor, sonra bir blok görülüyor ve ondan sonra
  // HER istek aniden ~10-13s'ye sabitleniyor" davranışının kök nedeniydi. Bu
  // bayrak, aynı çağrı içinde seviyeyi en fazla 1 kez artırmayı garantiler.
  let blockSignaledThisCall = false
  const signalBlockOnce = async () => {
    if (blockSignaledThisCall) return
    blockSignaledThisCall = true
    await onBlockSignal()
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": sharedUserAgent,
          "Accept-Language": "en-US,en;q=0.9",
          // Gerçek bir tarayıcıya daha yakın bir istek imzası, Transfermarkt'ın
          // bot korumasının tetiklenme sıklığını azaltmayı hedefler (daha az
          // 403/429 = daha az retry'a düşme = ortalama sürede iyileşme).
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          // Sitenin kendi içinden geliyormuş gibi görünmek için — gerçek bir
          // tarayıcıda ard arda sayfa gezintisinde Referer hep dolu olur.
          Referer: `${BASE_URL}/`,
          // Bkz. modül üstündeki sharedCookieJar/sharedUserAgent açıklaması —
          // Cloudflare'ın önceki yanıtta verdiği çerezi geri göndererek
          // "devam eden aynı oturum" görüntüsü veriyoruz.
          ...(sharedCookieJar ? { Cookie: sharedCookieJar } : {}),
        },
        redirect: "follow",
        signal: controller.signal,
      })
      mergeCookiesFromResponse(res)
      await persistIdentity()

      if (!res.ok) {
        if (res.status === 404) {
          // Sayfa gerçekten yok — bu bir hata değil, "veri yok" sonucudur.
          return null
        }
        const isBlockOrTransient = res.status >= 500 || res.status === 429 || res.status === 403
        if (isBlockOrTransient) await signalBlockOnce()
        if (isBlockOrTransient && attempt < retries) {
          const retryAfterHeader = res.headers.get("retry-after")
          const retryAfterMs = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) * 1000 : Number.NaN
          const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : BLOCKING_RETRY_DELAYS_MS[attempt]
          console.warn(
            `[v0] Transfermarkt fetch geçici olarak başarısız (${res.status}), ${delay}ms sonra tekrar denenecek (deneme ${attempt + 1}/${retries + 1}): ${url}`,
          )
          await sleep(delay)
          continue
        }
        lastError = `HTTP ${res.status}`
        break
      }

      const html = await res.text()
      if (looksLikeBlockPage(html)) {
        await signalBlockOnce()
        if (attempt < retries) {
          const delay = BLOCKING_RETRY_DELAYS_MS[attempt]
          console.warn(
            `[v0] Transfermarkt soft-block algılandı (200 ama meydan okuma/anormal küçük sayfa), ${delay}ms sonra tekrar denenecek (deneme ${attempt + 1}/${retries + 1}): ${url}`,
          )
          await sleep(delay)
          continue
        }
        lastError = "Soft block (meydan okuma sayfası)"
        break
      }
      return html
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata"
      await signalBlockOnce()
      if (attempt < retries) {
        await sleep(BLOCKING_RETRY_DELAYS_MS[attempt])
        continue
      }
      break
    } finally {
      clearTimeout(timeoutId)
    }
  }

  console.error(`[v0] Transfermarkt fetch tüm denemelerden sonra başarısız oldu (${lastError}): ${url}`)
  throw new Error(`Transfermarkt fetch başarısız oldu (${lastError ?? "bilinmeyen hata"}): ${url}`)
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

export interface ScrapedPlayerPosition {
  /** Transfermarkt'ın ham "Main position:" metni, örn. "Defensive Midfield" */
  mainPosition: string | null
  /** Transfermarkt'ın ham "Other position:" metinleri (birden fazla olabilir) */
  secondaryPositions: string[]
}

/**
 * Bir Transfermarkt oyuncu profilinden ana/yan mevki bilgisini çeker.
 * SADECE arka planda kademeli çalışan mevki backfill'i (bkz.
 * lib/player-position-sync.ts) tarafından çağrılır.
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

/** Cron job'ın sırayla çağıracağı, tüm desteklenen 24 ligin id listesi. */
export const SCRAPABLE_LEAGUE_IDS: number[] = FEATURED_LEAGUE_IDS
