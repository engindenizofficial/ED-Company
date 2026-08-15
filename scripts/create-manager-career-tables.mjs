// Tek seferlik şema kurulum scripti — "Kulübünü Kur" (menajer kariyeri) oyunu
// için "manager_career" ve "manager_squad_player" tablolarını oluşturur.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/create-manager-career-tables.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "manager_career" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
      "difficulty" text NOT NULL,
      "startingBudgetEur" numeric(14, 2) NOT NULL,
      "opponentStrengthPercent" integer NOT NULL,
      "logoFile" text NOT NULL,
      "clubName" text NOT NULL,
      "managerName" text NOT NULL,
      "leagueId" integer NOT NULL,
      "formation" text NOT NULL DEFAULT '4-4-2',
      "status" text NOT NULL DEFAULT 'building',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "manager_squad_player" (
      "id" text PRIMARY KEY,
      "careerId" text NOT NULL REFERENCES "manager_career"("id") ON DELETE CASCADE,
      "playerId" integer NOT NULL,
      "playerName" text NOT NULL,
      "photo" text,
      "realTeamName" text,
      "realTeamLogo" text,
      "position" text NOT NULL,
      "priceEur" numeric(14, 2) NOT NULL,
      "role" text NOT NULL,
      "slotKey" text,
      "benchIndex" integer,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "manager_squad_player_careerId_idx"
    ON "manager_squad_player" ("careerId")
  `)

  console.log("[v0] manager_career ve manager_squad_player tabloları hazır.")
  await pool.end()
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
