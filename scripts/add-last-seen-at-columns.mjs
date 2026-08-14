// Tek seferlik şema kurulum scripti — artık ligde/kadroda olmayan (transfer olmuş
// oyuncu, ligden düşmüş takım vb.) "hayalet" kayıtları tespit edip temizleyebilmek
// için "lastSeenAt" kolonunu ekler. Var olan satırlar now() ile doldurulur, böylece
// migration'dan hemen sonraki cron çalışmasından önce yanlışlıkla silinmezler.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/add-last-seen-at-columns.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `ALTER TABLE "team_market_value" ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamp NOT NULL DEFAULT now()`,
  `ALTER TABLE "player_market_value" ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamp NOT NULL DEFAULT now()`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] lastSeenAt columns added successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
