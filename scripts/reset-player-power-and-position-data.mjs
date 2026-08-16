// Oyuncu güç (rating) ve mevki sistemini tamamen sıfırlar — yeni mevkiye
// özel form kriterleri (bkz. lib/player-power.ts POSITION_FORM_WEIGHTS) ve
// spesifik alt mevki gösterimiyle sıfırdan, doğru şekilde yeniden kurulsun
// diye. Piyasa değeri verisine (player_market_value/team_market_value)
// DOKUNULMAZ — base rating bunlardan türediği için taban veri sağlam kalır,
// sadece üstüne kurulu güç/mevki katmanı sıfırlanır.
//
// Silinenler:
// - player_power (base/current/form güç puanları)
// - player_power_processed_fixture (hangi fikstürlerin işlendiği takibi)
// - player_power_cron_run (günlük güç güncelleme cron ilerleme durumu)
// - player_power_backfill_cron_run (tam sezon backfill ilerleme durumu)
// - player_position (Transfermarkt kaynaklı alt mevki profilleri)
// - player_position_cron_run (mevki backfill ilerleme durumu)
//
// Menajer kariyeri kadroları (manager_career, manager_squad_player) BU
// SCRIPT'TEN ETKİLENMEZ.
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const powerDeleted = await client.query("DELETE FROM player_power")
    const powerFixturesDeleted = await client.query("DELETE FROM player_power_processed_fixture")
    const powerDailyCronDeleted = await client.query("DELETE FROM player_power_cron_run")
    const powerBackfillCronDeleted = await client.query("DELETE FROM player_power_backfill_cron_run")
    const positionDeleted = await client.query("DELETE FROM player_position")
    const positionCronDeleted = await client.query("DELETE FROM player_position_cron_run")

    await client.query("COMMIT")

    console.log("[v0] Oyuncu güç + mevki verileri sıfırlandı:")
    console.log(`  - player_power: ${powerDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_power_processed_fixture: ${powerFixturesDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_power_cron_run: ${powerDailyCronDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_power_backfill_cron_run: ${powerBackfillCronDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_position: ${positionDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_position_cron_run: ${positionCronDeleted.rowCount} kayıt silindi`)
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Sıfırlama başarısız:", err)
  process.exit(1)
})
