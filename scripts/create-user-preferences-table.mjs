import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_preferences" (
      "userId" text PRIMARY KEY,
      "themeColor" text NOT NULL DEFAULT 'green',
      "locale" text NOT NULL DEFAULT 'tr',
      "notificationsEnabled" boolean NOT NULL DEFAULT false,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)

  console.log("[v0] user_preferences tablosu hazır.")
  await pool.end()
}

main().catch(async (error) => {
  console.error("[v0] Tercih tablosu kurulamadı:", error)
  await pool.end()
  process.exit(1)
})
