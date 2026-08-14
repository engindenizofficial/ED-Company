import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  `ALTER TABLE "market_value_review_queue" ADD COLUMN IF NOT EXISTS "entityCountry" text`,
  `ALTER TABLE "market_value_review_queue" ADD COLUMN IF NOT EXISTS "candidateCountry" text`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] OK:", sql.split("\n")[0].trim())
    }
    console.log("[v0] Review queue country columns added successfully.")
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
