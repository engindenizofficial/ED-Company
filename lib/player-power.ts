/** Oyuncu güç motorunun saf hesaplama fonksiyonları. */
const MIN_POWER = 1
const MAX_POWER = 99

const MARKET_VALUE_FLOOR_EUR = 100_000
const MARKET_VALUE_PIVOT_EUR = 8_000_000
const MARKET_VALUE_CEIL_EUR = 200_000_000
const MARKET_POWER_AT_FLOOR = 50
const MARKET_POWER_AT_PIVOT = 82
const MARKET_POWER_AT_CEIL = 90

function clampPower(value: number): number {
  return Math.max(MIN_POWER, Math.min(MAX_POWER, Math.round(value)))
}

function marketPowerFromValue(valueEur: number | null | undefined): number | null {
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

export function computeLivePowerFromMarketValue(valueEur: number | null | undefined): number | null {
  return marketPowerFromValue(valueEur)
}
