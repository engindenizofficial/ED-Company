import { Redis } from "@upstash/redis"
import type { FixturePlayerStat, FixturesResponse, GeminiPrediction, LeaguePageData, LiveMatchData, PlayerPageData } from "./types"

// Shared server-side store. Everything the app shows is persisted here so that
// every visitor — same user on another device, or a brand new user — is served
// the SAME saved data instead of triggering fresh API-Football / Gemini calls.

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

function getRedis(): Redis | null {
  return redis
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const K = {
  fixtures: (date: string) => `ed:fixtures:${date}`,
  live: (fixtureId: number) => `ed:live:${fixtureId}`,
  prediction: (fixtureId: number) => `ed:pred:${fixtureId}`,
  playerStats: (fixtureId: number) => `ed:fxplayers:${fixtureId}`,
  player: (playerId: number) => `ed:player:${playerId}`,
  league: (leagueId: number, season: number) => `ed:league:${leagueId}:${season}`,
}

// TTLs (seconds). Live data expires so a refresh can pull genuinely new numbers;
// Gemini predictions NEVER expire — once made they are locked forever.
const FIXTURES_TTL = 60 * 60 * 12    // 12h backstop; refreshed on demand
const LIVE_TTL = 60 * 60 * 6         // 6h backstop for live match data
const PLAYER_STATS_TTL = 60 * 60 * 6 // 6h for fixture player stats
const PLAYER_TTL = 60 * 60 * 24      // 24h for player profile
const LEAGUE_TTL = 60 * 60 * 6       // 6h for league data

// ---------------------------------------------------------------------------
// Fixtures (refreshable)
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
// Live match data (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedLive(fixtureId: number): Promise<LiveMatchData | null> {
  if (!redis) return null
  try {
    return (await redis.get<LiveMatchData>(K.live(fixtureId))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedLive failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedLive(fixtureId: number, data: LiveMatchData): Promise<void> {
  if (!redis) return
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
  if (!redis) return null
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
  if (!redis) return prediction
  try {
    const ok = await redis.set(K.prediction(fixtureId), prediction, { nx: true })
    if (ok === "OK" || ok === null) {
      if (ok === "OK") return prediction
    }
    const existing = await getLockedPrediction(fixtureId)
    return existing ?? prediction
  } catch (err) {
    console.log("[v0] redis lockPrediction failed:", err instanceof Error ? err.message : err)
    return prediction
  }
}

/**
 * Force-write a prediction regardless of whether one already exists.
 * Used to upgrade old predictions that were generated with incomplete data.
 */
export async function forceLockPrediction(
  fixtureId: number,
  prediction: GeminiPrediction,
): Promise<GeminiPrediction> {
  if (!redis) return prediction
  try {
    await redis.set(K.prediction(fixtureId), prediction)
    return prediction
  } catch (err) {
    console.log("[v0] redis forceLockPrediction failed:", err instanceof Error ? err.message : err)
    return prediction
  }
}

// ---------------------------------------------------------------------------
// Fixture player stats (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedFixturePlayerStats(fixtureId: number): Promise<FixturePlayerStat[] | null> {
  if (!redis) return null
  try {
    return (await redis.get<FixturePlayerStat[]>(K.playerStats(fixtureId))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedFixturePlayerStats failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedFixturePlayerStats(fixtureId: number, data: FixturePlayerStat[]): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.playerStats(fixtureId), data, { ex: PLAYER_STATS_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedFixturePlayerStats failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Player page data (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedPlayer(playerId: number): Promise<PlayerPageData | null> {
  if (!redis) return null
  try {
    return (await redis.get<PlayerPageData>(K.player(playerId))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedPlayer failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedPlayer(playerId: number, data: PlayerPageData): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.player(playerId), data, { ex: PLAYER_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedPlayer failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// League page data (refreshable)
// ---------------------------------------------------------------------------

export async function getCachedLeague(leagueId: number, season: number): Promise<LeaguePageData | null> {
  if (!redis) return null
  try {
    return (await redis.get<LeaguePageData>(K.league(leagueId, season))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedLeague failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedLeague(leagueId: number, season: number, data: LeaguePageData): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.league(leagueId, season), data, { ex: LEAGUE_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedLeague failed:", err instanceof Error ? err.message : err)
  }
}

/** Batch read locked predictions for many fixtures (used to fill card scores). */
export async function getLockedPredictionsMap(
  fixtureIds: number[],
): Promise<Map<number, GeminiPrediction>> {
  const map = new Map<number, GeminiPrediction>()
  if (fixtureIds.length === 0) return map
  if (!redis) return map
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
