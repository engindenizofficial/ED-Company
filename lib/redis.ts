import { Redis } from "@upstash/redis"
import type { FixturePlayerStat, FixturesResponse, LiveMatchData } from "./types"

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
  live: (fixtureId: number) => `ed:live:${fixtureId}`,
  playerStats: (fixtureId: number) => `ed:fxplayers:${fixtureId}`,

}

// TTLs (seconds)
const FIXTURES_TTL = 30              // 30s — polling manager 15s'de yazar, TTL aralarında cache'i canlı tutar
const LIVE_TTL = 20                  // 20s — polling manager 10s'de yazar, TTL aralarında cache'i canlı tutar
const PLAYER_STATS_TTL = 60 * 60 * 6 // 6h


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
// Live match data
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

export async function setCachedLive(fixtureId: number, data: LiveMatchData, ttl = LIVE_TTL): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.live(fixtureId), data, { ex: ttl })
  } catch (err) {
    console.log("[v0] redis setCachedLive failed:", err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Fixture player stats
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
// Bulk cache check — returns which fixture IDs already have live data cached
// ---------------------------------------------------------------------------

export async function getCachedFixtureIds(fixtureIds: number[]): Promise<number[]> {
  if (!redis || fixtureIds.length === 0) return []
  try {
    const keys = fixtureIds.map((id) => K.live(id))
    // mget returns an array of values (null if missing)
    const values = await redis.mget<(LiveMatchData | null)[]>(...keys)
    return fixtureIds.filter((_, i) => values[i] !== null)
  } catch (err) {
    console.log("[v0] redis getCachedFixtureIds failed:", err instanceof Error ? err.message : err)
    return []
  }
}




