// Tek seferlik şema düzeltme scripti — "market_value_cron_run" tablosuna
// "lastChainError" ve "lastChainErrorAt" sütunlarını ekler.
//
// Kök neden: zincirin bir sonraki adımını tetikleyen self-fetch isteği
// (triggerChainContinuation, bkz. lib/market-value-cron-run.ts) tüm
// denemelerden sonra başarısız olursa şimdiye kadar sadece console.error ile
// loglanıyordu — DB'ye HİÇBİR İZ yazılmıyordu. Admin panelinde bu yüzden
// zincir "kırıldı" (heartbeat eskimiş) olarak görünüyordu ama GERÇEK sebep
// (örn. "HTTP 401" — Vercel Deployment Protection'ın self-fetch'i
// engellemesi) hiçbir yerde görünmüyordu, sadece sunucu loglarında kalıyordu.
//
// Bu sütunlar artık son self-fetch tetikleme hatasını (varsa) ve ne zaman
// olduğunu kalıcı tutar; admin panelinde doğrudan gösterilir.
// Bkz. lib/db/schema.ts, lib/market-value-cron-run.ts,
// app/api/cron/update-market-values/route.ts,
// app/api/cron/resume-market-values/route.ts,
// components/market-value-cron-status.tsx.
//
// Çalıştırma:
// node --env-file-if-exists=/vercel/share/.env.project scripts/add-market-value-cron-chain-error-columns.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `ALTER TABLE "market_value_cron_run" ADD COLUMN IF NOT EXISTS "lastChainError" text`,
  `ALTER TABLE "market_value_cron_run" ADD COLUMN IF NOT EXISTS "lastChainErrorAt" timestamp`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] market_value_cron_run.lastChainError / lastChainErrorAt eklendi.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
