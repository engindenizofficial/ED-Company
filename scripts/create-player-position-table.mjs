// Tek seferlik şema kurulum scripti — Transfermarkt alt mevki backfill'i için
// "player_position" ve "player_position_cron_run" tablolarını oluşturur
// (bkz. lib/player-positions.ts, lib/player-position-sync.ts,
// app/api/cron/backfill-player-positions).
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-player-position-table.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "player_position" (
    "id" text PRIMARY KEY,
    "playerId" integer NOT NULL UNIQUE,
    "transfermarktPlayerId" text,
    "mainPositionRaw" text,
    "mainPosition" text,
    "secondaryPositionsRaw" jsonb NOT NULL DEFAULT '[]',
    "secondaryPositions" jsonb NOT NULL DEFAULT '[]',
    "source" text NOT NULL DEFAULT 'transfermarkt',
    "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "player_position_cron_run" (
    "id" text PRIMARY KEY,
    "runStartedAt" timestamp NOT NULL,
    "runFinishedAt" timestamp,
    "status" text NOT NULL DEFAULT 'running',
    "playersProcessed" integer NOT NULL DEFAULT 0,
    "playersMatched" integer NOT NULL DEFAULT 0,
    "lastError" text,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "player_position_playerId_idx" ON "player_position" ("playerId")`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] player_position tabloları hazır.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
