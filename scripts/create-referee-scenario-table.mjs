// Tek seferlik şema kurulum scripti — "referee_scenario" tablosunu oluşturur.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-referee-scenario-table.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "referee_scenario" (
      "id" text PRIMARY KEY,
      "homeTeam" text NOT NULL,
      "awayTeam" text NOT NULL,
      "competition" text NOT NULL,
      "matchLabel" text NOT NULL,
      "minute" integer NOT NULL,
      "description" text NOT NULL,
      "youtubeVideoId" text NOT NULL,
      "startSeconds" integer NOT NULL DEFAULT 0,
      "options" jsonb NOT NULL,
      "correctOptionIndex" integer NOT NULL,
      "explanation" text NOT NULL,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "referee_scenario_isActive_idx"
    ON "referee_scenario" ("isActive")
  `)
  console.log("[v0] referee_scenario tablosu ve indeks hazır.")
  await pool.end()
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
