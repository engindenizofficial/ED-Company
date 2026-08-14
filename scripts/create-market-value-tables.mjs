import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "team_market_value" (
    "id" text PRIMARY KEY,
    "teamId" integer NOT NULL UNIQUE,
    "leagueId" integer NOT NULL,
    "teamName" text NOT NULL,
    "transfermarktTeamId" text,
    "transfermarktTeamSlug" text,
    "totalValueEur" numeric(14, 2),
    "matchConfidence" integer,
    "matchStatus" text NOT NULL DEFAULT 'unmatched',
    "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "player_market_value" (
    "id" text PRIMARY KEY,
    "playerId" integer NOT NULL UNIQUE,
    "teamId" integer NOT NULL,
    "playerName" text NOT NULL,
    "transfermarktPlayerId" text,
    "transfermarktPlayerSlug" text,
    "valueEur" numeric(14, 2),
    "matchConfidence" integer,
    "matchStatus" text NOT NULL DEFAULT 'unmatched',
    "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "market_value_review_queue" (
    "id" text PRIMARY KEY,
    "entityType" text NOT NULL,
    "entityId" integer NOT NULL,
    "entityName" text NOT NULL,
    "candidateName" text,
    "candidateTransfermarktId" text,
    "candidateValueEur" numeric(14, 2),
    "confidence" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "resolvedAt" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "team_market_value_league_idx" ON "team_market_value" ("leagueId")`,
  `CREATE INDEX IF NOT EXISTS "player_market_value_team_idx" ON "player_market_value" ("teamId")`,
  `CREATE INDEX IF NOT EXISTS "market_value_review_queue_status_idx" ON "market_value_review_queue" ("status")`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] Market value tables created successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
