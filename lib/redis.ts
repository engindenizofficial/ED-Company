import { Redis } from "@upstash/redis"
import type { FixturesResponse, GeminiPrediction, LiveMatchData } from "./types"

// Shared server-side store. Everything the app shows is persisted here so that
// every visitor — same user on another device, or a brand new user — is served
// the SAME saved data instead of triggering fresh API-Football / Gemini calls.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
})

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const K = {
  fixtures: (date: string) => `ed:fixtures:${date}`,
  live: (fixtureId: number) => `ed:live:${fixtureId}`,
  prediction: (fixtureId: number) => `ed:pred:${fixtureId}`,
}

// TTLs (seconds). Live data expires so a refresh can pull genuinely new numbers;
// Gemini predictions NEVER expire — once made they are locked forever.
const FIXTURES_TTL = 60 * 60 * 12 // 12h backstop; refreshed on demand
const LIVE_TTL = 60 * 60 * 6 // 6h backstop for live match data

// ---------------------------------------------------------------------------
// Fixtures (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedFixtures(date: string): Promise<FixturesResponse | null> {
  try {
    return (await redis.get<FixturesResponse>(K.fixtures(date))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedFixtures failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedFixtures(date: string, data: FixturesResponse): Promise<void> {
  try {
    await redis.set(K.fixtures(date), data, { ex: FIXTURES_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedFixtures failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Live match data (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedLive(fixtureId: number): Promise<LiveMatchData | null> {
  try {
    return (await redis.get<LiveMatchData>(K.live(fixtureId))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedLive failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedLive(fixtureId: number, data: LiveMatchData): Promise<void> {
  try {
    await redis.set(K.live(fixtureId), data, { ex: LIVE_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedLive failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Gemini prediction (LOCKED — write once, never overwrite)
// ---------------------------------------------------------------------------

export async function getLockedPrediction(fixtureId: number): Promise<GeminiPrediction | null> {
  try {
    return (await redis.get<GeminiPrediction>(K.prediction(fixtureId))) ?? null
  } catch (err) {
    console.log("[v0] redis getLockedPrediction failed:", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Persist a Gemini prediction only if none exists yet (NX = set-if-absent).
 * Returns the stored prediction: either the one we just wrote, or the pre-existing
 * locked one if another request beat us to it. This guarantees a prediction can
 * never change once created, even under concurrent requests.
 */
export async function lockPrediction(
  fixtureId: number,
  prediction: GeminiPrediction,
): Promise<GeminiPrediction> {
  try {
    const ok = await redis.set(K.prediction(fixtureId), prediction, { nx: true })
    if (ok === "OK" || ok === null) {
      // ok === "OK" -> we won the write. ok === null under some client versions
      // means NX failed; re-read to get the winning value.
      if (ok === "OK") return prediction
    }
    const existing = await getLockedPrediction(fixtureId)
    return existing ?? prediction
  } catch (err) {
    console.log("[v0] redis lockPrediction failed:", err instanceof Error ? err.message : err)
    return prediction
  }
}

/** Batch read locked predictions for many fixtures (used to fill card scores). */
export async function getLockedPredictionsMap(
  fixtureIds: number[],
): Promise<Map<number, GeminiPrediction>> {
  const map = new Map<number, GeminiPrediction>()
  if (fixtureIds.length === 0) return map
  try {
    const keys = fixtureIds.map(K.prediction)
    const values = await redis.mget<(GeminiPrediction | null)[]>(...keys)
    fixtureIds.forEach((id, i) => {
      const v = values[i]
      if (v) map.set(id, v)
    })
  } catch (err) {
    console.log("[v0] redis getLockedPredictionsMap failed:", err instanceof Error ? err.message : err)
  }
  return map
}
