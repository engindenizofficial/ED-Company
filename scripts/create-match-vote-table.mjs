// Tek seferlik şema kurulum scripti — "matchVote" tablosunu oluşturur.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-match-vote-table.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "matchVote" (
      "id" text PRIMARY KEY,
      "fixtureId" integer NOT NULL,
      "voterId" text NOT NULL,
      "choice" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "matchVote_fixtureId_voterId_idx"
    ON "matchVote" ("fixtureId", "voterId")
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "matchVote_fixtureId_idx"
    ON "matchVote" ("fixtureId")
  `)
  console.log("[v0] matchVote tablosu ve indeksler hazır.")
  await pool.end()
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
