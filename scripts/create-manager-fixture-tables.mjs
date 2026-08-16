// Tek seferlik şema kurulum scripti — "Kulübünü Kur" (menajer kariyeri) oyununda
// tam lig simülasyonu için "manager_fixture" ve "manager_team_strength" tablolarını oluşturur.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-manager-fixture-tables.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "manager_fixture" (
      "id" text PRIMARY KEY,
      "careerId" text NOT NULL REFERENCES "manager_career"("id") ON DELETE CASCADE,
      "matchday" integer NOT NULL,
      "homeTeamId" integer,
      "homeTeamName" text NOT NULL,
      "homeTeamLogo" text,
      "awayTeamId" integer,
      "awayTeamName" text NOT NULL,
      "awayTeamLogo" text,
      "isUserMatch" boolean NOT NULL DEFAULT false,
      "status" text NOT NULL DEFAULT 'scheduled',
      "homeGoals" integer,
      "awayGoals" integer,
      "events" jsonb NOT NULL DEFAULT '[]',
      "playedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "manager_fixture_careerId_idx"
    ON "manager_fixture" ("careerId")
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "manager_fixture_careerId_matchday_idx"
    ON "manager_fixture" ("careerId", "matchday")
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "manager_team_strength" (
      "id" text PRIMARY KEY,
      "careerId" text NOT NULL REFERENCES "manager_career"("id") ON DELETE CASCADE,
      "teamId" integer NOT NULL,
      "defense" numeric(6, 2) NOT NULL,
      "midfield" numeric(6, 2) NOT NULL,
      "attack" numeric(6, 2) NOT NULL,
      "overall" numeric(6, 2) NOT NULL,
      "computedAt" timestamp NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "manager_team_strength_careerId_teamId_idx"
    ON "manager_team_strength" ("careerId", "teamId")
  `)

  console.log("[v0] manager_fixture ve manager_team_strength tabloları hazır.")
  await pool.end()
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
