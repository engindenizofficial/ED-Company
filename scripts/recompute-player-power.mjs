// Tek seferlik bakım betiği: lib/player-power.ts içindeki skorlama formülü
// (örn. marketPowerFromValue eğrisi) değiştiğinde, mevcut player_power
// satırlarının marketPower/basePower/currentPower alanlarını yeni formülle
// yeniden hesaplar. Momentum/form katmanı kaldırıldı — currentPower artık
// basePower ile aynıdır (formModifier her zaman 0 kabul edilir).
//
// Çalıştırma:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/recompute-player-power.mjs

import { Pool } from "pg"

const MIN_POWER = 1
const MAX_POWER = 99

const MARKET_VALUE_FLOOR_EUR = 100_000
const MARKET_VALUE_PIVOT_EUR = 8_000_000
const MARKET_VALUE_CEIL_EUR = 200_000_000

const MARKET_POWER_AT_FLOOR = 50
const MARKET_POWER_AT_PIVOT = 82
const MARKET_POWER_AT_CEIL = 90

const RATING_FLOOR = 3.0
const RATING_CEIL = 10.0

const MAX_RATING_WEIGHT = 0.35
const RATING_WEIGHT_FULL_AT_COUNT = 10

function clampPower(value) {
  return Math.max(MIN_POWER, Math.min(MAX_POWER, Math.round(value)))
}

function marketPowerFromValue(valueEur) {
  if (valueEur === null || valueEur === undefined || !Number.isFinite(valueEur) || valueEur <= 0) {
    return null
  }
  const clampedValue = Math.max(MARKET_VALUE_FLOOR_EUR, Math.min(MARKET_VALUE_CEIL_EUR, valueEur))
  const logValue = Math.log10(clampedValue)

  if (clampedValue <= MARKET_VALUE_PIVOT_EUR) {
    const logFloor = Math.log10(MARKET_VALUE_FLOOR_EUR)
    const logPivot = Math.log10(MARKET_VALUE_PIVOT_EUR)
    const ratio = (logValue - logFloor) / (logPivot - logFloor)
    return clampPower(MARKET_POWER_AT_FLOOR + (MARKET_POWER_AT_PIVOT - MARKET_POWER_AT_FLOOR) * ratio)
  }

  const logPivot = Math.log10(MARKET_VALUE_PIVOT_EUR)
  const logCeil = Math.log10(MARKET_VALUE_CEIL_EUR)
  const ratio = (logValue - logPivot) / (logCeil - logPivot)
  return clampPower(MARKET_POWER_AT_PIVOT + (MARKET_POWER_AT_CEIL - MARKET_POWER_AT_PIVOT) * ratio)
}

function ratingPowerFromAverage(avgRating) {
  if (avgRating === null || avgRating === undefined || !Number.isFinite(avgRating)) {
    return null
  }
  const clampedRating = Math.max(RATING_FLOOR, Math.min(RATING_CEIL, avgRating))
  const ratio = (clampedRating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR)
  return clampPower(MIN_POWER + (MAX_POWER - MIN_POWER) * ratio)
}

function computeBasePower({ valueEur, seasonRatingSum, seasonRatingCount }) {
  const market = marketPowerFromValue(valueEur)
  const avgRating = seasonRatingCount > 0 ? seasonRatingSum / seasonRatingCount : null
  const rating = ratingPowerFromAverage(avgRating)

  if (market === null && rating === null) return null
  if (market === null) return rating
  if (rating === null) return market

  const ratingWeight = Math.min(seasonRatingCount / RATING_WEIGHT_FULL_AT_COUNT, 1) * MAX_RATING_WEIGHT
  return clampPower(market * (1 - ratingWeight) + rating * ratingWeight)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const { rows } = await pool.query(`
    select pp."playerId", pp."seasonRatingSum", pp."seasonRatingCount", pmv."valueEur"
    from player_power pp
    left join player_market_value pmv on pmv."playerId" = pp."playerId"
  `)

  console.log(`[v0] ${rows.length} satır yeniden hesaplanacak.`)

  let updated = 0
  for (const row of rows) {
    const valueEur = row.valueEur !== null ? Number(row.valueEur) : null
    const seasonRatingSum = Number(row.seasonRatingSum)
    const seasonRatingCount = row.seasonRatingCount

    const marketPower = marketPowerFromValue(valueEur)
    const basePower = computeBasePower({ valueEur, seasonRatingSum, seasonRatingCount })
    await pool.query(
      `update player_power set "marketPower" = $1, "basePower" = $2, "updatedAt" = now() where "playerId" = $3`,
      [marketPower, basePower, row.playerId],
    )
    updated++
  }

  console.log(`[v0] ${updated} satır güncellendi.`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
