const BASE_URL = "https://v3.football.api-sports.io"

// API-Football aynı anda çok fazla isteği hız sınırına (429) çarpabiliyor.
// Panel açıldığında 8-11 endpoint aynı anda Promise.all ile çekiliyordu;
// bunlardan bazıları rastgele 429 alıp sessizce boş dizi döndüğü için
// aynı takım/oyuncu/lig için her açılışta farklı sayıda bölüm görünüyordu.
// Bunu önlemek için: (1) eş zamanlı istek sayısını sınırlıyoruz, (2) 429/5xx
// yanıtlarında üstel geri çekilme ile otomatik yeniden deniyoruz, (3) aynı
// endpoint+parametre kombinasyonunu kısa bir süre için bellekte cache'leyip
// aynı paneli art arda aç/kapatmanın gereksiz yeniden istek atmasını (ve bu
// yüzden rastgele 429'a çarpmasını) önlüyoruz. Devam eden aynı istek için de
// tekilleştirme (in-flight dedupe) yapıyoruz.
const MAX_CONCURRENT = 4
const MAX_RETRIES = 5

// Aynı endpoint+parametre için kısa süreli response cache.
// Panel verileri (kadro, istatistik, transferler vb.) saniyeler içinde
// değişmez; bu TTL sadece art arda aç/kapatmalarda tutarlılık sağlamak ve
// istek hacmini azaltmak için var. `revalidate` belirtilmeyen çağrılar için
// varsayılan olarak kullanılır.
const DEFAULT_CACHE_TTL_MS = 90_000
const responseCache = new Map<string, { data: unknown; expiresAt: number }>()
// Aynı anahtar için devam eden isteği paylaş (aynı anda tetiklenen tekrar
// istekler tek bir ağ çağrısına düşsün).
const inFlight = new Map<string, Promise<unknown>>()

function cacheKey(path: string, params: Record<string, string | number>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return `${path}?${sortedParams}`
}

let activeRequests = 0
const queue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activeRequests < MAX_CONCURRENT) {
        activeRequests++
        resolve()
      } else {
        queue.push(tryAcquire)
      }
    }
    tryAcquire()
  })
}

function releaseSlot() {
  activeRequests--
  const next = queue.shift()
  if (next) next()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Tek bir istek için zaman aşımı. Bu OLMADAN, API-Football yanıt vermeden
 * bağlantıyı askıda tutarsa `fetch()` süresiz beklerdi — cron zinciri
 * hiçbir hata/log bırakmadan, serverless'in maxDuration (300s) sınırında
 * SESSİZCE öldürülene kadar tam olarak burada donardı. Zaman aşımı burada
 * AbortController ile catch bloğuna düşürülüyor, böylece aşağıdaki mevcut
 * retry mantığı (429/5xx/ağ hatası) devreye giriyor.
 */
const FETCH_TIMEOUT_MS = 20_000

export class ApiFootballError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface FetchOptions {
  /** Next.js data cache revalidation süresi (saniye). "no-store" ile birlikte kullanılmaz. */
  revalidate?: number
  /** Her zaman taze veri çekmek için "no-store" kullanılır (Next.js cache'ini atlar). */
  cache?: "no-store"
}

/**
 * API-Football'a istek atar. Eş zamanlı istek sayısını sınırlar ve
 * 429 (rate limit) / 5xx yanıtlarında üstel geri çekilme ile yeniden dener.
 * Tüm denemeler tükenirse hata fırlatır.
 */
export async function apiFootballFetch<T>(
  path: string,
  params: Record<string, string | number>,
  options: FetchOptions = {},
): Promise<T[]> {
  const key = cacheKey(path, params)

  const bypassCache = options.cache === "no-store"

  // `no-store` yalnızca tamamlanmış response cache'ini atlamalıdır. Aynı
  // endpoint aynı anda iki kez istenirse devam eden isteği paylaşmaya devam
  // ediyoruz; aksi halde sekme değiştirirken gereksiz çift API çağrısı ve
  // 429 riski oluşur.
  if (!bypassCache) {
    const cached = responseCache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.data as T[]
    if (cached) responseCache.delete(key)
  }

  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T[]>

  const ttlMs = options.revalidate != null ? options.revalidate * 1000 : DEFAULT_CACHE_TTL_MS
  const promise = doFetch<T>(path, params, options)
    .then((data) => {
      // no-store çağrılarında ne başarılı response ne de boş fallback cache'lenir.
      // Böylece ilk açılıştaki geçici boş/eksik cevap sonraki sekme açılışlarına
      // taşınmaz.
      if (!bypassCache && data.length > 0 && ttlMs > 0) {
        responseCache.set(key, { data, expiresAt: Date.now() + ttlMs })
      }
      return data
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise
}

async function doFetch<T>(
  path: string,
  params: Record<string, string | number>,
  options: FetchOptions = {},
): Promise<T[]> {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) {
    throw new ApiFootballError("API_FOOTBALL_KEY tanımlı değil.", 500)
  }

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const url = `${BASE_URL}${path}?${search.toString()}`

  const fetchInit: RequestInit & { next?: { revalidate: number } } =
    options.cache === "no-store"
      ? { headers: { "x-apisports-key": apiKey }, cache: "no-store" }
      : { headers: { "x-apisports-key": apiKey }, next: { revalidate: options.revalidate ?? 60 } }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, { ...fetchInit, signal: controller.signal })
    } catch (err) {
      releaseSlot()
      lastError = err
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(2 ** attempt * 400, 4000))
        continue
      }
      throw err instanceof Error ? err : new ApiFootballError("Ağ hatası", 500)
    } finally {
      clearTimeout(timeoutId)
    }
    releaseSlot()

    if (res.status === 429 || res.status >= 500) {
      lastError = new ApiFootballError(`API-Football isteği başarısız (${res.status})`, res.status)
      if (attempt < MAX_RETRIES) {
        const retryAfterHeader = res.headers.get("retry-after")
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null
        await sleep(retryAfterMs ?? Math.min(2 ** attempt * 400, 4000))
        continue
      }
      throw lastError
    }

    if (!res.ok) {
      throw new ApiFootballError(`API-Football isteği başarısız (${res.status})`, res.status)
    }

    const json = await res.json()
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
      const msg = Object.values(json.errors).join(" ")
      throw new ApiFootballError(String(msg || "API-Football hatası"), 502)
    }
    return (json.response as T[]) ?? []
  }

  throw lastError instanceof Error ? lastError : new ApiFootballError("Bilinmeyen hata", 500)
}

/**
 * Best-effort varyant: tüm denemeler tükendiğinde hata fırlatmak yerine
 * boş dizi döner. Tek bir ölü uç noktanın tüm agregasyonu batırmaması için.
 * apiFootballFetch zaten yeniden deneme yaptığı için buraya düşen hatalar
 * artık nadir olacak (örn. gerçekten süresi dolmuş anahtar, kalıcı 5xx).
 */
export async function safeApiFootballFetch<T>(
  path: string,
  params: Record<string, string | number>,
  options?: FetchOptions,
): Promise<T[]> {
  try {
    return await apiFootballFetch<T>(path, params, options)
  } catch {
    return []
  }
}
