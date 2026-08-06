import { Redis } from "@upstash/redis"
import type { FixturesResponse, MatchPrediction, PredictionResult } from "./types"
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

let redis: Redis | null = null
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
  fixtures: (date: string) => `ed:fixtures:${date}`,
  allTeams: (season: number) => `ed:allteams:${season}`,
  prediction: (fixtureId: number) => `ed:prediction:${fixtureId}`,
  predictionResults: (date: string) => `ed:prediction-results:${date}`,
  allTimePredictionResults: () => `ed:prediction-results:all`,
  pendingPredictions: () => `ed:pending-predictions`,
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

export async function getCachedFixtures(date: string): Promise<FixturesResponse | null> {
  if (!redis) return null
  try {
    return (await redis.get<FixturesResponse>(K.fixtures(date))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedFixtures failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedFixtures(date: string, data: FixturesResponse): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.fixtures(date), data, { ex: FIXTURES_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedFixtures failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// All teams (tüm 23 ligin takım listesi — arama için)
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






