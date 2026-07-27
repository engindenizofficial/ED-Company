import { Redis } from "@upstash/redis"
import type { FixturePlayerStat, FixturesResponse, LeaguePageData, LiveMatchData, PlayerPageData, PlayerSummary } from "./types"

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
  player: (playerId: number) => `ed:player:${playerId}`,
  league: (leagueId: number, season: number) => `ed:league:${leagueId}:${season}`,
  topPlayers: (season: number) => `ed:topplayers:${season}`,
}

// TTLs (seconds)
const FIXTURES_TTL = 60 * 60 * 12    // 12h
const LIVE_TTL = 60 * 60 * 6         // 6h
const PLAYER_STATS_TTL = 60 * 60 * 6 // 6h
const PLAYER_TTL = 60 * 60 * 24      // 24h
const LEAGUE_TTL = 60 * 60 * 6       // 6h
const TOP_PLAYERS_TTL = 60 * 60 * 6  // 6h

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

export async function setCachedLive(fixtureId: number, data: LiveMatchData): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.live(fixtureId), data, { ex: LIVE_TTL })
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
// Player page data
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
// League page data
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

// ---------------------------------------------------------------------------
// Top players (all leagues)
// ---------------------------------------------------------------------------

export async function getCachedTopPlayers(season: number): Promise<PlayerSummary[] | null> {
  if (!redis) return null
  try {
    return (await redis.get<PlayerSummary[]>(K.topPlayers(season))) ?? null
  } catch (err) {
    console.log("[v0] redis getCachedTopPlayers failed:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedTopPlayers(season: number, data: PlayerSummary[]): Promise<void> {
  if (!redis) return
  try {
    await redis.set(K.topPlayers(season), data, { ex: TOP_PLAYERS_TTL })
  } catch (err) {
    console.log("[v0] redis setCachedTopPlayers failed:", err instanceof Error ? err.message : err)
  }
}
