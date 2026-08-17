// Tek seferlik şema kurulum scripti — Web Push bildirimleri için tabloları oluşturur.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-push-notification-tables.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "push_subscription" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL,
      "endpoint" text NOT NULL UNIQUE,
      "p256dh" text NOT NULL,
      "auth" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "push_subscription_userId_idx"
    ON "push_subscription" ("userId")
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "live_fixture_notification_state" (
      "fixtureId" text PRIMARY KEY,
      "lastStatusShort" text,
      "lastHomeGoals" integer NOT NULL DEFAULT 0,
      "lastAwayGoals" integer NOT NULL DEFAULT 0,
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  console.log("[v0] push_subscription ve live_fixture_notification_state tabloları hazır.")
  await pool.end()
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
