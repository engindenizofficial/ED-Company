/** Oyuncu güç motorunun saf hesaplama fonksiyonları. */
export const MIN_POWER = 1
export const MAX_POWER = 99

const MAX_RATING_WEIGHT = 0.35
const RATING_WEIGHT_FULL_AT_COUNT = 10
const MARKET_VALUE_FLOOR_EUR = 100_000
const MARKET_VALUE_PIVOT_EUR = 8_000_000
const MARKET_VALUE_CEIL_EUR = 200_000_000
const MARKET_POWER_AT_FLOOR = 50
const MARKET_POWER_AT_PIVOT = 82
const MARKET_POWER_AT_CEIL = 90
const RATING_FLOOR = 3
const RATING_CEIL = 10

/** Bir fixture'dan güç hesabına taşınan tek oyuncu verisi. */
export interface PlayerMatchRating {
  rating: number | null
}

export function clampPower(value: number): number {
  return Math.max(MIN_POWER, Math.min(MAX_POWER, Math.round(value)))
}

export function marketPowerFromValue(valueEur: number | null | undefined): number | null {
  if (valueEur === null || valueEur === undefined || !Number.isFinite(valueEur) || valueEur <= 0) return null
  const clampedValue = Math.max(MARKET_VALUE_FLOOR_EUR, Math.min(MARKET_VALUE_CEIL_EUR, valueEur))
  const logValue = Math.log10(clampedValue)

  if (clampedValue <= MARKET_VALUE_PIVOT_EUR) {
    const ratio = (logValue - Math.log10(MARKET_VALUE_FLOOR_EUR)) /
      (Math.log10(MARKET_VALUE_PIVOT_EUR) - Math.log10(MARKET_VALUE_FLOOR_EUR))
    return clampPower(MARKET_POWER_AT_FLOOR + (MARKET_POWER_AT_PIVOT - MARKET_POWER_AT_FLOOR) * ratio)
  }

  const ratio = (logValue - Math.log10(MARKET_VALUE_PIVOT_EUR)) /
    (Math.log10(MARKET_VALUE_CEIL_EUR) - Math.log10(MARKET_VALUE_PIVOT_EUR))
  return clampPower(MARKET_POWER_AT_PIVOT + (MARKET_POWER_AT_CEIL - MARKET_POWER_AT_PIVOT) * ratio)
}

export function ratingPowerFromAverage(avgRating: number | null | undefined): number | null {
  if (avgRating === null || avgRating === undefined || !Number.isFinite(avgRating)) return null
  const ratio = (Math.max(RATING_FLOOR, Math.min(RATING_CEIL, avgRating)) - RATING_FLOOR) /
    (RATING_CEIL - RATING_FLOOR)
  return clampPower(MIN_POWER + (MAX_POWER - MIN_POWER) * ratio)
}

export function seasonRatingAverage(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null
}

/** Piyasa değeri ve sezon rating'i karışımından doğrudan nihai gücü üretir. */
export function computeBasePower(params: {
  valueEur: number | null | undefined
  seasonRatingSum: number
  seasonRatingCount: number
}): number | null {
  const market = marketPowerFromValue(params.valueEur)
  const rating = ratingPowerFromAverage(seasonRatingAverage(params.seasonRatingSum, params.seasonRatingCount))
  if (market === null && rating === null) return null
  if (market === null) return rating
  if (rating === null) return market
  const ratingWeight = Math.min(params.seasonRatingCount / RATING_WEIGHT_FULL_AT_COUNT, 1) * MAX_RATING_WEIGHT
  return clampPower(market * (1 - ratingWeight) + rating * ratingWeight)
}

export function computeLivePowerFromMarketValue(valueEur: number | null | undefined): number | null {
  return marketPowerFromValue(valueEur)
}
