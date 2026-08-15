// Tek seferlik şema kurulum scripti — "player_market_value" tablosuna
// Transfermarkt kaynaklı TAM ad ("fullName", örn. "Ousmane Dembélé") kolonu
// ekler. Menajer kariyeri kadro arama ekranı, API-Football'ın kısaltılmış
// "playerName" ("O. Dembélé") formatına takılmadan isim VEYA soyisimle
// arama yapabilsin diye eklendi.
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/add-player-full-name-column.mjs
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [`ALTER TABLE "player_market_value" ADD COLUMN IF NOT EXISTS "fullName" text`]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] fullName column added successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
