// ---------------------------------------------------------------------------
// Yeni /api/search/* uçları için piyasa değeri OKUMA yardımcıları. Mevcut
// lib/market-values.ts'i (tekil id bazlı) DEĞİL, doğrudan tabloları toplu
// okuyup Map'e çeviren, arama sıralaması için optimize edilmiş fonksiyonlar
// içerir. Asla scrape tetiklemez — sadece haftalık cron'un doldurduğu
// team_market_value / player_market_value tablolarını okur.
// ---------------------------------------------------------------------------
import { db } from "@/lib/db"
import { teamMarketValue, playerMarketValue } from "@/lib/db/schema"
import { inArray, sql } from "drizzle-orm"
import { FEATURED_LEAGUE_IDS } from "@/lib/leagues"

/** teamId -> toplam kadro piyasa değeri (eur). Kayıt yoksa/null ise 0 kabul edilir. */
export async function getFeaturedTeamMarketValueMap(): Promise<Map<number, number>> {
  const rows = await db
    .select({ teamId: teamMarketValue.teamId, totalValueEur: teamMarketValue.totalValueEur })
    .from(teamMarketValue)
    .where(inArray(teamMarketValue.leagueId, FEATURED_LEAGUE_IDS))

  const map = new Map<number, number>()
  for (const row of rows) {
    map.set(row.teamId, row.totalValueEur !== null ? Number(row.totalValueEur) : 0)
  }
  return map
}

/** leagueId -> ligdeki tüm takımların kadro piyasa değeri toplamı (eur). */
export async function getFeaturedLeagueMarketValueMap(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      leagueId: teamMarketValue.leagueId,
      total: sql<string>`coalesce(sum(${teamMarketValue.totalValueEur}), 0)`,
    })
    .from(teamMarketValue)
    .where(inArray(teamMarketValue.leagueId, FEATURED_LEAGUE_IDS))
    .groupBy(teamMarketValue.leagueId)

  const map = new Map<number, number>()
  for (const row of rows) {
    map.set(row.leagueId, Number(row.total))
  }
  return map
}

export interface FeaturedPlayerMarketValueEntry {
  playerId: number
  playerName: string
  teamId: number
  valueEur: number
}

/**
 * 24 öne çıkan lige ait takımlardaki (teamId'ler bilinmeden) TÜM oyuncuların
 * piyasa değerlerini döner. playerMarketValue.teamId, o oyuncunun eşleştirme
 * anındaki takımını tutar; bu yüzden önce takım dizininden (team-directory.ts)
 * gelen id kümesiyle filtrelenmesi çağıran taraftan yapılır.
 */
export async function getPlayerMarketValuesByTeamIds(
  teamIds: number[],
): Promise<FeaturedPlayerMarketValueEntry[]> {
  if (teamIds.length === 0) return []

  const rows = await db
    .select({
      playerId: playerMarketValue.playerId,
      playerName: playerMarketValue.playerName,
      teamId: playerMarketValue.teamId,
      valueEur: playerMarketValue.valueEur,
    })
    .from(playerMarketValue)
    .where(inArray(playerMarketValue.teamId, teamIds))

  return rows.map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    valueEur: row.valueEur !== null ? Number(row.valueEur) : 0,
  }))
}
