import { Redis } from "@upstash/redis"
import type { FixturesResponse, MatchPrediction, PredictionResult, VoteChoice, VoteCounts } from "./types"
import type { TeamSearchResult } from "@/app/api/teams/search/route"

// Shared server-side store.

// Normalize the URL: @upstash/redis only accepts https:// REST URLs.
// If a rediss:// or redis:// TCP URL was accidentally provided, convert it.
function normalizeUpstashUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith("https://")) return raw
  // rediss://default:<token>@<host>:<port>  →  https://<host>
  const match = raw.match(/^redis[s]?:\/\/[^@]+@([^:]+)/)
  if (match) return `https://${match[1]}`
  return raw
}

const redisUrl = normalizeUpstashUrl(process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

export let redis: Redis | null = null
try {
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken })
  }
} catch (err) {
  console.log("[v0] Redis init failed, running without cache:", err instanceof Error ? err.message : err)
  redis = null
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const K = {
  fixtures: (date: string, timeZone: string) => `ed:fixtures:${timeZone}:${date}`,
  allTeams: (season: number) => `ed:allteams:${season}`,
  prediction: (fixtureId: number) => `ed:prediction:${fixtureId}`,
  predictionResults: (date: string) => `ed:prediction-results:${date}`,
  allTimePredictionResults: () => `ed:prediction-results:all`,
  pendingPredictions: () => `ed:pending-predictions`,
  predictionInProgress: (fixtureId: number) => `ed:predicting:${fixtureId}`,
  voteCounts: (fixtureId: number) => `ed:vote:counts:${fixtureId}`,
  voteChoices: (fixtureId: number) => `ed:vote:choices:${fixtureId}`,
  chainLock: (name: string) => `ed:chain-lock:${name}`,
}

// ---------------------------------------------------------------------------
// Basit self-chaining kilidi — "zaten çalışan bir zincir varsa dıştan gelen
// yeni bir tetiklemeyi (örn. vercel.json'daki periyodik giriş cron'u) erken
// reddet" deseni için. TTL, kilidin heartbeat'i her adımda tazelenmezse
// otomatik düşmesini sağlar (kırılmış zincirin sonsuza dek kilitli kalmasını
// engeller).
// ---------------------------------------------------------------------------

/** Kilidi almaya çalışır. Alınabildiyse true, zaten tutuluyorsa false döner. */
export async function acquireChainLock(name: string, ttlSeconds: number): Promise<boolean> {
  if (!redis) return true // Redis yoksa kilitleme atlanır (dev/ilk kurulum) — zincir yine de çalışabilir.
  try {
    const result = await redis.set(K.chainLock(name), Date.now(), { nx: true, ex: ttlSeconds })
    return result !== null
  } catch (err) {
    console.log("[v0] redis acquireChainLock failed:", err instanceof Error ? err.message : err)
    return true
  }
}

/** Kilidi serbest bırakır (zincir tamamen durduğunda). */
export async function releaseChainLock(name: string): Promise<void> {
  if (!redis) return
  try {
    await redis.del(K.chainLock(name))
  } catch (err) {
    console.log("[v0] redis releaseChainLock failed:", err instanceof Error ? err.message : err)
  }
}

export interface PendingPrediction {
  fixtureId: number
  date: string // YYYY-MM-DD (TR)
  homeName: string
  awayName: string
}

// Fixtures: 6 saat
const FIXTURES_TTL = 60 * 60 * 6

/** allTeams için gece yarısı UTC+3'e kadar kalan süreyi saniye cinsinden döndürür. */
function secondsUntilMidnightTR(): number {
  const now = new Date()
  // Istanbul gece yarısı
  const midnight = new Date(now.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }))
  midnight.setDate(midnight.getDate() + 1)
  const msLeft = midnight.getTime() - now.getTime()
  return Math.max(60, Math.floor(msLeft / 1000))
}


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function getCachedFixtures(
  date: string,
  timeZone = "Europe/Istanbul",
): Promise<FixturesResponse | null> {
  if (!redis) return null
  try {
    return (await redis.get<FixturesResponse>(K.fixtures(date, timeZone))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedFixtures failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedFixtures(
  date: string,
  data: FixturesResponse,
  timeZone = "Europe/Istanbul",
): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.fixtures(date, timeZone), data, { ex: FIXTURES_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedFixtures failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// All teams (tüm 24 ligin takım listesi — arama için)
// ---------------------------------------------------------------------------

export async function getCachedAllTeams(season: number): Promise<TeamSearchResult[] | null> {
  if (!redis) return null
  try {
    return (await redis.get<TeamSearchResult[]>(K.allTeams(season))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedAllTeams failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedAllTeams(season: number, data: TeamSearchResult[]): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.allTeams(season), data, { ex: secondsUntilMidnightTR() })
  } catch (err) {
    console.log("[v0] redis setCachedAllTeams failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------

export async function getCachedPrediction(fixtureId: number): Promise<MatchPrediction | null> {
  if (!redis) return null
  try {
    return (await redis.get<MatchPrediction>(K.prediction(fixtureId))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedPrediction failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedPrediction(fixtureId: number, data: MatchPrediction): Promise<void> {
  if (!redis) return
  try {
    // 30 gün TTL — maç bittikten sonra pending-check'in tahmini bulabilmesi için
    await redis.set(K.prediction(fixtureId), data, { ex: 60 * 60 * 24 * 30 })
  } catch (err) {
    console.log("[v0] redis setCachedPrediction failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * Tek bir tahmini HER YERDEN siler: tahmin cache'i, bekleyen tahminler
 * listesi, tüm zamanlar başarı paneli kaydı ve her günün başarı paneli
 * kaydı (ed:prediction-results:{date}). Admin "tahmini sil" butonu bunu
 * çağ��rır — silme sonrası tahmin başarı panelinde de görünmemeli.
 */
export async function deletePredictionCompletely(fixtureId: number): Promise<boolean> {
  if (!redis) return false
  try {
    // 1. Tahmin cache'i
    await redis.del(K.prediction(fixtureId))

    // 2. Bekleyen tahminler listesi
    await removePendingPrediction(fixtureId)

    // 3. Tüm zamanlar başarı paneli kaydı
    const allTime = await getAllTimePredictionResults()
    const filteredAllTime = allTime.filter((r) => r.fixtureId !== fixtureId)
    if (filteredAllTime.length !== allTime.length) {
      await redis.set(K.allTimePredictionResults(), filteredAllTime)
    }

    // 4. Her günün başarı paneli kaydı — ed:prediction-results:* taran��r
    let cursor = 0
    const dailyKeys: string[] = []
    do {
      const [nextCursor, batch] = await redis.scan(cursor, { match: "ed:prediction-results:*", count: 100 })
      cursor = Number(nextCursor)
      dailyKeys.push(...batch)
    } while (cursor !== 0)

    for (const key of dailyKeys) {
      // "ed:prediction-results:all" zaten yukarıda ayrıca temizlendi
      if (key === K.allTimePredictionResults()) continue
      const existing = await redis.get<PredictionResult[]>(key)
      if (!existing || existing.length === 0) continue
      const filtered = existing.filter((r) => r.fixtureId !== fixtureId)
      if (filtered.length !== existing.length) {
        await redis.set(key, filtered, { keepTtl: true })
      }
    }

    return true
  } catch (err) {
    console.log("[v0] redis deletePredictionCompletely failed:", err instanceof Error ? err.message : err)
    return false
  }
}

/** ed:prediction:* ile eşleşen tüm tahmin key'lerini siler. */
export async function deleteAllPredictions(): Promise<number> {
  if (!redis) return 0
  try {
    let cursor = 0
    const keys: string[] = []
    do {
      const [nextCursor, batch] = await redis.scan(cursor, { match: "ed:prediction:*", count: 100 })
      cursor = Number(nextCursor)
      keys.push(...batch)
    } while (cursor !== 0)

    if (keys.length === 0) return 0
    await redis.del(...keys)
    return keys.length
  } catch (err) {
    console.log("[v0] redis deleteAllPredictions failed:", err instanceof Error ? err.message : err)
    return 0
  }
}

// ---------------------------------------------------------------------------
// Prediction Results (başarı paneli)
// ---------------------------------------------------------------------------

export async function getPredictionResults(date: string): Promise<PredictionResult[]> {
  if (!redis) return []
  try {
    return (await redis.get<PredictionResult[]>(K.predictionResults(date))) ?? []
  } catch (err) {
    console.log("[v0] redis getPredictionResults failed:", err instanceof Error ? err.message : err)
    return []
  }
}

export async function savePredictionResult(date: string, result: PredictionResult): Promise<void> {
  if (!redis) return
  try {
    // Günlük key'e kaydet
    const existing = await getPredictionResults(date)
    const idx = existing.findIndex((r) => r.fixtureId === result.fixtureId)
    if (idx >= 0) {
      existing[idx] = result
    } else {
      existing.push(result)
    }
    await redis.set(K.predictionResults(date), existing, { ex: secondsUntilMidnightTR() + 60 * 60 * 24 })

    // Tüm zamanlar key'ine de kaydet (TTL yok — kalıcı)
    const allTime = await getAllTimePredictionResults()
    const allIdx = allTime.findIndex((r) => r.fixtureId === result.fixtureId)
    if (allIdx >= 0) {
      allTime[allIdx] = result
    } else {
      allTime.push(result)
    }
    await redis.set(K.allTimePredictionResults(), allTime)
  } catch (err) {
    console.log("[v0] redis savePredictionResult failed:", err instanceof Error ? err.message : err)
  }
}

export async function getAllTimePredictionResults(): Promise<PredictionResult[]> {
  if (!redis) return []
  try {
    return (await redis.get<PredictionResult[]>(K.allTimePredictionResults())) ?? []
  } catch (err) {
    console.log("[v0] redis getAllTimePredictionResults failed:", err instanceof Error ? err.message : err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Pending Predictions (yenile butonunda kontrol edilecek bekleyen tahminler)
// ---------------------------------------------------------------------------

export async function getPendingPredictions(): Promise<PendingPrediction[]> {
  if (!redis) return []
  try {
    return (await redis.get<PendingPrediction[]>(K.pendingPredictions())) ?? []
  } catch (err) {
    console.log("[v0] redis getPendingPredictions failed:", err instanceof Error ? err.message : err)
    return []
  }
}

export async function addPendingPrediction(entry: PendingPrediction): Promise<void> {
  if (!redis) return
  try {
    const existing = await getPendingPredictions()
    if (existing.some((p) => p.fixtureId === entry.fixtureId)) return
    existing.push(entry)
    // 30 gün TTL — yeterince uzun
    await redis.set(K.pendingPredictions(), existing, { ex: 60 * 60 * 24 * 30 })
  } catch (err) {
    console.log("[v0] redis addPendingPrediction failed:", err instanceof Error ? err.message : err)
  }
}

export async function removePendingPrediction(fixtureId: number): Promise<void> {
  if (!redis) return
  try {
    const existing = await getPendingPredictions()
    const filtered = existing.filter((p) => p.fixtureId !== fixtureId)
    await redis.set(K.pendingPredictions(), filtered, { ex: 60 * 60 * 24 * 30 })
  } catch (err) {
    console.log("[v0] redis removePendingPrediction failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Prediction in-progress marker — tahmin oluşturma isteği arka planda
// (after() ile) sürdüğü sürece set edilir. Client, panelden çıkıp tekrar
// girse veya sayfayı yenilese bile bu marker sayesinde 11 LLM çağrısını
// sıfırdan tekrar tetiklemez; bunun yerine sadece sonucu bekler (polling).
// TTL, sunucu tarafı işlem çökse/asılı kalsa bile marker'ın sonsuza dek
// takılı kalmamasını sağlayan bir güvenlik ağıdır (normal süre ~1-3 dk).
// ---------------------------------------------------------------------------

const PREDICTION_IN_PROGRESS_TTL_SECONDS = 5 * 60

/** Marker'ı ayarlamayı dener. Zaten set edilmişse false (başka bir istek zaten işliyor), yoksa true döner. */
export async function markPredictionInProgress(fixtureId: number): Promise<boolean> {
  if (!redis) return true // Redis yoksa çakışma kontrolü atlanır (dev/ilk kurulum)
  try {
    // NX: sadece key yoksa set et — atomik "kilit alma" deseni
    const result = await redis.set(K.predictionInProgress(fixtureId), Date.now(), {
      ex: PREDICTION_IN_PROGRESS_TTL_SECONDS,
      nx: true,
    })
    return result !== null
  } catch (err) {
    console.log("[v0] redis markPredictionInProgress failed:", err instanceof Error ? err.message : err)
    return true
  }
}

export async function isPredictionInProgress(fixtureId: number): Promise<boolean> {
  if (!redis) return false
  try {
    return (await redis.exists(K.predictionInProgress(fixtureId))) === 1
  } catch (err) {
    console.log("[v0] redis isPredictionInProgress failed:", err instanceof Error ? err.message : err)
    return false
  }
}

export async function clearPredictionInProgress(fixtureId: number): Promise<void> {
  if (!redis) return
  try {
    await redis.del(K.predictionInProgress(fixtureId))
  } catch (err) {
    console.log("[v0] redis clearPredictionInProgress failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Maç oylaması — üye olsun olmasın herkes tek tıkla taraf seçebilir.
// Kim neye oy verdi: "ed:vote:choices:{fixtureId}" hash'i (voterId -> choice)
// Toplam sayaçlar: "ed:vote:counts:{fixtureId}" hash'i (home/draw/away -> count)
// ---------------------------------------------------------------------------

// 10 gün — maç bittikten sonra da sonuçların görülebilmesi için yeterli süre
const VOTE_TTL = 60 * 60 * 24 * 10

const EMPTY_COUNTS: VoteCounts = { home: 0, draw: 0, away: 0 }

export async function getVoteCounts(fixtureId: number): Promise<VoteCounts> {
  if (!redis) return EMPTY_COUNTS
  try {
    const raw = await redis.hgetall<Record<string, string | number>>(K.voteCounts(fixtureId))
    if (!raw) return EMPTY_COUNTS
    return {
      home: Number(raw.home ?? 0),
      draw: Number(raw.draw ?? 0),
      away: Number(raw.away ?? 0),
    }
  } catch (err) {
    console.log("[v0] redis getVoteCounts failed:", err instanceof Error ? err.message : err)
    return EMPTY_COUNTS
  }
}

export async function getVoterChoice(fixtureId: number, voterId: string): Promise<VoteChoice | null> {
  if (!redis || !voterId) return null
  try {
    const choice = await redis.hget<VoteChoice>(K.voteChoices(fixtureId), voterId)
    return choice ?? null
  } catch (err) {
    console.log("[v0] redis getVoterChoice failed:", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Bir kullanıcının oyunu kaydeder. Kullanıcı bu maça daha önce oy verdiyse
 * ve yeni seçim farklıysa oyunu günceller: eski seçimin sayacı bir azalır,
 * yeni seçimin sayacı bir artar (toplam oy sayısı değişmez). Aynı seçime
 * tekrar basılırsa hiçbir şey değişmeden mevcut durum döndürülür.
 */
export async function castVote(
  fixtureId: number,
  voterId: string,
  choice: VoteChoice,
): Promise<{ counts: VoteCounts; myVote: VoteChoice }> {
  if (!redis) return { counts: EMPTY_COUNTS, myVote: choice }
  try {
    const existing = await getVoterChoice(fixtureId, voterId)
    if (existing === choice) {
      const counts = await getVoteCounts(fixtureId)
      return { counts, myVote: choice }
    }

    await redis.hset(K.voteChoices(fixtureId), { [voterId]: choice })
    await redis.expire(K.voteChoices(fixtureId), VOTE_TTL)
    if (existing) {
      // Oy değiştiriliyor — eski seçimin sayacını düşür, toplamı sabit tut.
      await redis.hincrby(K.voteCounts(fixtureId), existing, -1)
    }
    await redis.hincrby(K.voteCounts(fixtureId), choice, 1)
    await redis.expire(K.voteCounts(fixtureId), VOTE_TTL)

    const counts = await getVoteCounts(fixtureId)
    return { counts, myVote: choice }
  } catch (err) {
    console.log("[v0] redis castVote failed:", err instanceof Error ? err.message : err)
    return { counts: EMPTY_COUNTS, myVote: choice }
  }
}






