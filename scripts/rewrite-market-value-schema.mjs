import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ---------------------------------------------------------------------------
// Piyasa değeri sisteminin şemasını yeniden yazan, TEK SEFERLİK migration.
// Elle çalıştırılır: `node scripts/rewrite-market-value-schema.mjs`
//
// Yapılanlar:
// 1. Yeni "league_market_value" tablosu oluşturulur.
// 2. "team_market_value" / "player_market_value": eski kilit/hayalet-kayıt
//    alanları ("manualOverride", "lastSeenAt") kaldırılır, yeni ülke +
//    yüzde alanları eklenir.
// 3. "market_value_review_queue": "countryLookupAttempted" kaldırılır,
//    ülke alanları zaten vardı (dokunulmaz).
// 4. "market_value_cron_run": "phase" + "chainMessageId" eklenir.
// 5. Script sonunda TÜM piyasa değeri verisi silinir (TRUNCATE) — eski
//    "manualOverride" kilitlerinin anlamsız kalmış durumuyla karışmaması
//    için temiz bir sayfa açılır. Yeni akışta "Taramayı Başlat" da zaten
//    her seferinde sıfırdan tarıyor.
// ---------------------------------------------------------------------------

const statements = [
  `CREATE TABLE IF NOT EXISTS "league_market_value" (
    "id" text PRIMARY KEY,
    "leagueId" integer NOT NULL UNIQUE,
    "leagueName" text NOT NULL,
    "leagueCountry" text,
    "transfermarktLeagueName" text,
    "transfermarktLeagueCountry" text,
    "totalValueEur" numeric(14, 2),
    "nameMatchPercent" integer,
    "countryMatchPercent" integer,
    "matchPercent" integer NOT NULL DEFAULT 0,
    "matchStatus" text NOT NULL DEFAULT 'review',
    "lastScrapedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  `ALTER TABLE "team_market_value"
    DROP COLUMN IF EXISTS "manualOverride",
    DROP COLUMN IF EXISTS "lastSeenAt",
    ADD COLUMN IF NOT EXISTS "teamCountry" text,
    ADD COLUMN IF NOT EXISTS "transfermarktTeamName" text,
    ADD COLUMN IF NOT EXISTS "transfermarktTeamCountry" text,
    ADD COLUMN IF NOT EXISTS "nameMatchPercent" integer,
    ADD COLUMN IF NOT EXISTS "countryMatchPercent" integer`,

  `ALTER TABLE "player_market_value"
    DROP COLUMN IF EXISTS "manualOverride",
    DROP COLUMN IF EXISTS "lastSeenAt",
    ADD COLUMN IF NOT EXISTS "playerCountry" text,
    ADD COLUMN IF NOT EXISTS "transfermarktPlayerCountry" text,
    ADD COLUMN IF NOT EXISTS "nameMatchPercent" integer,
    ADD COLUMN IF NOT EXISTS "countryMatchPercent" integer`,

  `ALTER TABLE "market_value_review_queue"
    DROP COLUMN IF EXISTS "countryLookupAttempted"`,

  `ALTER TABLE "market_value_cron_run"
    ADD COLUMN IF NOT EXISTS "phase" text NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS "chainMessageId" text`,

  `CREATE INDEX IF NOT EXISTS "league_market_value_league_idx" ON "league_market_value" ("leagueId")`,
]

const truncateStatements = [
  `TRUNCATE TABLE "league_market_value"`,
  `TRUNCATE TABLE "team_market_value"`,
  `TRUNCATE TABLE "player_market_value"`,
  `TRUNCATE TABLE "market_value_review_queue"`,
  `TRUNCATE TABLE "market_value_cron_run"`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    for (const sql of truncateStatements) {
      await client.query(sql)
      console.log("[v0] OK:", sql)
    }
    console.log("[v0] Piyasa değeri şeması yeniden yazıldı ve tüm eski veri temizlendi.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration başarısız:", err)
  process.exit(1)
})
