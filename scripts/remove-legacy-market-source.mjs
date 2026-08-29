import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Kaynağa bağlı veriler ve bunlardan türetilen güç kayıtları.
    for (const table of [
      "player_power_processed_fixture",
      "player_power_cron_run",
      "player_power_backfill_cron_run",
      "player_power",
      "player_position",
      "player_market_value",
      "team_market_value",
      "league_market_value",
    ]) {
      await client.query(`DELETE FROM ${table}`)
    }

    // Eski tarama/eşleştirme yardımcı tabloları artık kullanılmıyor.
    for (const table of [
      "market_value_review_queue",
      "market_value_player_staging",
      "market_value_team_staging",
      "market_value_league_staging",
      "market_value_cron_run",
      "player_position_cron_run",
    ]) {
      await client.query(`DROP TABLE IF EXISTS ${table}`)
    }

    await client.query(`
      ALTER TABLE league_market_value
        DROP COLUMN IF EXISTS "transfermarktLeagueName",
        DROP COLUMN IF EXISTS "transfermarktLeagueCountry",
        DROP COLUMN IF EXISTS "nameMatchPercent",
        DROP COLUMN IF EXISTS "countryMatchPercent",
        DROP COLUMN IF EXISTS "matchPercent",
        DROP COLUMN IF EXISTS "matchStatus",
        DROP COLUMN IF EXISTS "lastScrapedAt";

      ALTER TABLE team_market_value
        DROP COLUMN IF EXISTS "transfermarktTeamId",
        DROP COLUMN IF EXISTS "transfermarktTeamSlug",
        DROP COLUMN IF EXISTS "transfermarktTeamName",
        DROP COLUMN IF EXISTS "transfermarktTeamCountry",
        DROP COLUMN IF EXISTS "nameMatchPercent",
        DROP COLUMN IF EXISTS "countryMatchPercent",
        DROP COLUMN IF EXISTS "matchConfidence",
        DROP COLUMN IF EXISTS "matchStatus",
        DROP COLUMN IF EXISTS "lastScrapedAt";

      ALTER TABLE player_market_value
        DROP COLUMN IF EXISTS "transfermarktPlayerId",
        DROP COLUMN IF EXISTS "transfermarktPlayerSlug",
        DROP COLUMN IF EXISTS "transfermarktPlayerCountry",
        DROP COLUMN IF EXISTS "nameMatchPercent",
        DROP COLUMN IF EXISTS "countryMatchPercent",
        DROP COLUMN IF EXISTS "matchConfidence",
        DROP COLUMN IF EXISTS "matchStatus",
        DROP COLUMN IF EXISTS "lastScrapedAt";

      ALTER TABLE player_position
        DROP COLUMN IF EXISTS "transfermarktPlayerId",
        DROP COLUMN IF EXISTS "mainPositionRaw",
        DROP COLUMN IF EXISTS "secondaryPositionsRaw",
        DROP COLUMN IF EXISTS "lastScrapedAt";
      ALTER TABLE player_position ALTER COLUMN "source" SET DEFAULT 'external';
    `)

    await client.query("COMMIT")
    console.log("[v0] Eski piyasa değeri kaynağına ait veriler ve şema alanları kaldırıldı.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[v0] Kaynak temizliği başarısız:", error)
  process.exit(1)
})
