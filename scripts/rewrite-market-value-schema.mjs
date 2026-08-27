import { Pool } from "pg"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL eksik")

const pool = new Pool({ connectionString: databaseUrl })

const statements = [
  `DROP TABLE IF EXISTS "market_value_review_queue"`,
  `DROP TABLE IF EXISTS "market_value_player_staging"`,
  `DROP TABLE IF EXISTS "market_value_team_staging"`,
  `DROP TABLE IF EXISTS "market_value_league_staging"`,
  `DROP TABLE IF EXISTS "market_value_cron_run"`,
  `DROP TABLE IF EXISTS "league_market_value"`,
  `DROP TABLE IF EXISTS "team_market_value"`,
  `DROP TABLE IF EXISTS "player_market_value"`,
  `CREATE TABLE "league_market_value" (
    "id" text PRIMARY KEY, "leagueId" integer NOT NULL UNIQUE, "leagueName" text NOT NULL,
    "leagueCountry" text, "transfermarktLeagueName" text, "transfermarktLeagueCountry" text,
    "totalValueEur" numeric(14,2), "nameMatchPercent" integer, "countryMatchPercent" integer,
    "matchPercent" integer NOT NULL DEFAULT 0, "matchStatus" text NOT NULL DEFAULT 'matched',
    "lastScrapedAt" timestamp, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX "league_market_value_league_idx" ON "league_market_value" ("leagueId")`,
  `CREATE TABLE "team_market_value" (
    "id" text PRIMARY KEY, "teamId" integer NOT NULL UNIQUE, "leagueId" integer NOT NULL,
    "teamName" text NOT NULL, "teamCountry" text, "transfermarktTeamId" text,
    "transfermarktTeamSlug" text, "transfermarktTeamName" text, "transfermarktTeamCountry" text,
    "totalValueEur" numeric(14,2), "nameMatchPercent" integer, "countryMatchPercent" integer,
    "matchConfidence" integer, "matchStatus" text NOT NULL DEFAULT 'matched', "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE "player_market_value" (
    "id" text PRIMARY KEY, "playerId" integer NOT NULL UNIQUE, "teamId" integer NOT NULL,
    "playerName" text NOT NULL, "fullName" text, "playerCountry" text, "transfermarktPlayerId" text,
    "transfermarktPlayerSlug" text, "transfermarktPlayerCountry" text, "valueEur" numeric(14,2),
    "nameMatchPercent" integer, "countryMatchPercent" integer, "matchConfidence" integer,
    "matchStatus" text NOT NULL DEFAULT 'matched', "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE "market_value_league_staging" (
    "id" text PRIMARY KEY, "runId" text NOT NULL, "leagueId" integer NOT NULL UNIQUE,
    "tmName" text, "tmCountry" text, "tmValueEur" numeric(14,2), "afName" text, "afCountry" text,
    "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE "market_value_team_staging" (
    "id" text PRIMARY KEY, "runId" text NOT NULL, "leagueId" integer NOT NULL, "side" text NOT NULL,
    "externalId" text NOT NULL, "name" text NOT NULL, "country" text, "valueEur" numeric(14,2),
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX "market_value_team_staging_run_side_idx" ON "market_value_team_staging" ("runId", "side")`,
  `CREATE TABLE "market_value_player_staging" (
    "id" text PRIMARY KEY, "runId" text NOT NULL, "teamStagingId" text NOT NULL, "side" text NOT NULL,
    "externalId" text NOT NULL, "name" text NOT NULL, "country" text, "valueEur" numeric(14,2),
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX "market_value_player_staging_team_side_idx" ON "market_value_player_staging" ("teamStagingId", "side")`,
  `CREATE TABLE "market_value_review_queue" (
    "id" text PRIMARY KEY, "runId" text NOT NULL, "entityType" text NOT NULL, "leagueId" integer NOT NULL,
    "afTeamStagingId" text, "tmTeamStagingId" text, "afPlayerStagingId" text, "tmPlayerStagingId" text,
    "afName" text NOT NULL, "afCountry" text, "tmName" text, "tmCountry" text,
    "tmValueEur" numeric(14,2), "confidence" integer NOT NULL, "status" text NOT NULL DEFAULT 'pending',
    "createdAt" timestamp NOT NULL DEFAULT now(), "resolvedAt" timestamp
  )`,
  `CREATE INDEX "market_value_review_pending_idx" ON "market_value_review_queue" ("status", "entityType")`,
  `CREATE TABLE "market_value_cron_run" (
    "id" text PRIMARY KEY, "runStartedAt" timestamp NOT NULL, "status" text NOT NULL DEFAULT 'running',
    "phase" text NOT NULL DEFAULT 'tm_leagues', "currentLeagueIndex" integer NOT NULL DEFAULT 0,
    "currentTeamIndex" integer NOT NULL DEFAULT 0, "lastError" text, "lastErrorAt" timestamp,
    "heartbeatAt" timestamp NOT NULL DEFAULT now(), "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
]

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const statement of statements) await client.query(statement)
    await client.query("COMMIT")
    console.log("[v0] Piyasa değeri şeması temiz biçimde oluşturuldu.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[v0] Piyasa değeri şema kurulumu başarısız:", error)
  process.exit(1)
})
