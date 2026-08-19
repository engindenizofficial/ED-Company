// Tek seferlik şema düzeltme scripti — "player_position_cron_run" tablosuna
// "heartbeatAt" sütunu ekler. Kök neden: market_value_cron_run'daki
// heartbeatAt'ın (her batch'te tazelenen) aksine, bu tabloda "zincir kırıldı
// mı" kontrolü şimdiye kadar SADECE zincirin başında bir kere yazılan
// runStartedAt'a bakıyordu — bu yüzden saatlerce sürmesi normal olan sağlıklı
// bir zincir bile 6 dakika sonra hep "kırılmış" görünüyordu, ve admin'in
// "Şimdi Tara"ya basması bazen hâlâ sağlıklı ilerleyen bir zincirin üstüne
// paralel bir ikinci zincir başlatarak asıl kırılmaya yol açıyordu.
// Bkz. lib/db/schema.ts, app/api/cron/backfill-player-positions,
// app/actions/player-position-cron.ts.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/add-player-position-cron-heartbeat.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `ALTER TABLE "player_position_cron_run" ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamp NOT NULL DEFAULT now()`,
  // ALTER ... DEFAULT now() var olan satırlara ALTER anının zamanını yazar
  // ("az önce nabız attı" gibi görünür). "completed"/"failed" satırlar için
  // bu yanıltıcı olmasın diye bittikleri ana (runFinishedAt) geri alıyoruz —
  // hâlâ "running" olan (varsa) satırlara dokunmuyoruz, onlar zaten ALTER
  // anını başlangıç noktası olarak almalı.
  `UPDATE "player_position_cron_run" SET "heartbeatAt" = "runFinishedAt" WHERE "runFinishedAt" IS NOT NULL`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] player_position_cron_run.heartbeatAt eklendi.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migrasyon hatası:", err)
  process.exit(1)
})
