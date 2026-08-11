// Tek seferlik şema kurulum scripti — admin tarafından manuel onaylanan/reddedilen
// takım/oyuncu eşleşmelerini haftalık cron'un üzerine yazmasını önlemek için
// "manualOverride" kilit kolonunu ekler.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/add-manual-override-columns.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `ALTER TABLE "team_market_value" ADD COLUMN IF NOT EXISTS "manualOverride" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "player_market_value" ADD COLUMN IF NOT EXISTS "manualOverride" boolean NOT NULL DEFAULT false`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] manualOverride columns added successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
