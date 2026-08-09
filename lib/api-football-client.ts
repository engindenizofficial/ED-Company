const BASE_URL = "https://v3.football.api-sports.io"

// API-Football aynı anda çok fazla isteği hız sınırına (429) çarpabiliyor.
// Panel açıldığında 8-11 endpoint aynı anda Promise.all ile çekiliyordu;
// bunlardan bazıları rastgele 429 alıp sessizce boş dizi döndüğü için
// aynı takım/oyuncu/lig için her açılışta farklı sayıda bölüm görünüyordu.
// Bunu önlemek için: (1) eş zamanlı istek sayısını sınırlıyoruz, (2) 429/5xx
// yanıtlarında üstel geri çekilme ile otomatik yeniden deniyoruz.
const MAX_CONCURRENT = 4
const MAX_RETRIES = 3

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
  const key = process.env.API_FOOTBALL_KEY
  if (!key) {
    throw new ApiFootballError("API_FOOTBALL_KEY tanımlı değil.", 500)
  }

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const url = `${BASE_URL}${path}?${search.toString()}`

  const fetchInit: RequestInit & { next?: { revalidate: number } } =
    options.cache === "no-store"
      ? { headers: { "x-apisports-key": key }, cache: "no-store" }
      : { headers: { "x-apisports-key": key }, next: { revalidate: options.revalidate ?? 60 } }

  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot()
    let res: Response
    try {
      res = await fetch(url, fetchInit)
    } catch (err) {
      releaseSlot()
      lastError = err
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(2 ** attempt * 400, 4000))
        continue
      }
      throw err instanceof Error ? err : new ApiFootballError("Ağ hatası", 500)
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
