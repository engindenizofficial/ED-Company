import { db } from "./db"
import { teamMarketValue, playerMarketValue } from "./db/schema"
import { eq, inArray } from "drizzle-orm"

export { formatMarketValueEur } from "./market-value-format"

// ---------------------------------------------------------------------------
// Piyasa değeri OKUMA katmanı. Uygulamanın kullanıcıya açık tüm kısımları
// (API route'ları, panel bileşenleri) piyasa değerine SADECE bu dosya
// üzerinden erişir — asla canlı scrape tetiklemez, sadece cron'un
// (lib/market-value-sync.ts) haftalık doldurduğu tabloları okur.
// ---------------------------------------------------------------------------

export interface TeamMarketValueInfo {
  totalValueEur: number | null
  matchStatus: "matched" | "review" | "unmatched"
  lastScrapedAt: Date | null
}

export interface PlayerMarketValueInfo {
  valueEur: number | null
  matchStatus: "matched" | "review" | "unmatched"
  lastScrapedAt: Date | null
}

/** Tek bir takımın (API-Football id'si) toplam kadro piyasa değerini okur. */
export async function getTeamMarketValue(teamId: number): Promise<TeamMarketValueInfo | null> {
  const rows = await db
    .select({
      totalValueEur: teamMarketValue.totalValueEur,
      matchStatus: teamMarketValue.matchStatus,
      lastScrapedAt: teamMarketValue.lastScrapedAt,
    })
    .from(teamMarketValue)
    .where(eq(teamMarketValue.teamId, teamId))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  return {
    totalValueEur: row.totalValueEur !== null ? Number(row.totalValueEur) : null,
    matchStatus: row.matchStatus as TeamMarketValueInfo["matchStatus"],
    lastScrapedAt: row.lastScrapedAt,
  }
}

/** Tek bir oyuncunun (API-Football id'si) piyasa değerini okur. */
export async function getPlayerMarketValue(playerId: number): Promise<PlayerMarketValueInfo | null> {
  const rows = await db
    .select({
      valueEur: playerMarketValue.valueEur,
      matchStatus: playerMarketValue.matchStatus,
      lastScrapedAt: playerMarketValue.lastScrapedAt,
    })
    .from(playerMarketValue)
    .where(eq(playerMarketValue.playerId, playerId))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  return {
    valueEur: row.valueEur !== null ? Number(row.valueEur) : null,
    matchStatus: row.matchStatus as PlayerMarketValueInfo["matchStatus"],
    lastScrapedAt: row.lastScrapedAt,
  }
}

/**
 * Birden fazla oyuncunun piyasa değerini tek sorguda okur (kadro listesi gibi
 * N oyuncu için N sorgu atmamak için). Bulunamayan id'ler map'te yer almaz.
 */
export async function getPlayerMarketValues(
  playerIds: number[],
): Promise<Map<number, PlayerMarketValueInfo>> {
  const result = new Map<number, PlayerMarketValueInfo>()
  if (playerIds.length === 0) return result

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      valueEur: playerMarketValue.valueEur,
      matchStatus: playerMarketValue.matchStatus,
      lastScrapedAt: playerMarketValue.lastScrapedAt,
    })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.playerId, playerIds))

  for (const row of rows) {
    result.set(row.playerId, {
      valueEur: row.valueEur !== null ? Number(row.valueEur) : null,
      matchStatus: row.matchStatus as PlayerMarketValueInfo["matchStatus"],
      lastScrapedAt: row.lastScrapedAt,
    })
  }
  return result
}

