// Tek seferlik şema kurulum scripti — oyuncu güç motoru için "player_power",
// "player_power_processed_fixture" ve "player_power_cron_run" tablolarını
// oluşturur (bkz. lib/player-power.ts, lib/player-power-sync.ts,
// app/api/cron/update-player-power).
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-player-power-tables.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "player_power" (
    "id" text PRIMARY KEY,
    "playerId" integer NOT NULL UNIQUE,
    "teamId" integer,
    "marketPower" integer,
    "seasonYear" integer,
    "seasonRatingSum" numeric(10, 2) NOT NULL DEFAULT '0',
    "seasonRatingCount" integer NOT NULL DEFAULT 0,
    "basePower" integer,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "player_power_processed_fixture" (
    "id" text PRIMARY KEY,
    "fixtureId" integer NOT NULL UNIQUE,
    "processedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "player_power_cron_run" (
    "id" text PRIMARY KEY,
    "runStartedAt" timestamp NOT NULL,
    "runFinishedAt" timestamp,
    "status" text NOT NULL DEFAULT 'running',
    "fixturesScanned" integer NOT NULL DEFAULT 0,
    "fixturesProcessed" integer NOT NULL DEFAULT 0,
    "playersUpdated" integer NOT NULL DEFAULT 0,
    "lastError" text,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "player_power_playerId_idx" ON "player_power" ("playerId")`,
  `CREATE INDEX IF NOT EXISTS "player_power_processed_fixture_fixtureId_idx" ON "player_power_processed_fixture" ("fixtureId")`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] player_power tabloları hazır.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
