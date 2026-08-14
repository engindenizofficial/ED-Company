// Piyasa değeri sistemini tamamen sıfırlar:
// - Tüm review kuyruğu kayıtlarını (onaylı/reddedilmiş/beklemede fark etmeksizin) siler
// - Tüm takım piyasa değeri kayıtlarını siler
// - Tüm oyuncu piyasa değeri kayıtlarını siler
// - Tüm cron run (haftalık döngü durumu) kayıtlarını siler
//
// Bir sonraki cron tetiklemesinde (artık Çarşamba 00:00 UTC / TR 03:00) sistem
// sıfırdan, admin onaylarından bağımsız temiz bir taramayla başlar.
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const reviewDeleted = await client.query("DELETE FROM market_value_review_queue")
    const teamsDeleted = await client.query("DELETE FROM team_market_value")
    const playersDeleted = await client.query("DELETE FROM player_market_value")
    const cronRunsDeleted = await client.query("DELETE FROM market_value_cron_run")

    await client.query("COMMIT")

    console.log("[v0] Piyasa değeri verileri sıfırlandı:")
    console.log(`  - review_queue: ${reviewDeleted.rowCount} kayıt silindi`)
    console.log(`  - team_market_value: ${teamsDeleted.rowCount} kayıt silindi`)
    console.log(`  - player_market_value: ${playersDeleted.rowCount} kayıt silindi`)
    console.log(`  - market_value_cron_run: ${cronRunsDeleted.rowCount} kayıt silindi`)
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
