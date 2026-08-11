// Tek seferlik şema kurulum scripti — 23 ligi zincirleme işleyen haftalık cron
// döngüsünün durumunu (hangi ligde kalındı, kaç kez denendi, hata var mı)
// kalıcı olarak tutan "market_value_cron_run" tablosunu ekler. Bu sayede
// zincir bir yerde kesilirse (crash, zaman aşımı, ağ hatası) bir sonraki
// çağrı tam olarak nerede kalındığını bilir ve devam edebilir
// (bkz. lib/market-value-cron-run.ts, app/api/cron/resume-market-values).
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/add-market-value-cron-run-table.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `CREATE TABLE IF NOT EXISTS "market_value_cron_run" (
    "id" text PRIMARY KEY,
    "runStartedAt" timestamp NOT NULL,
    "status" text NOT NULL DEFAULT 'running',
    "currentLeagueIndex" integer NOT NULL DEFAULT 0,
    "hadErrors" boolean NOT NULL DEFAULT false,
    "leagueStatuses" jsonb NOT NULL,
    "heartbeatAt" timestamp NOT NULL DEFAULT now(),
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "market_value_cron_run_status_idx" ON "market_value_cron_run" ("status")`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] market_value_cron_run table created successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
