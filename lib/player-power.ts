/**
 * Oyuncu güç motoru — saf hesaplama fonksiyonları (yan etkisiz, DB/API'ye dokunmaz).
 *
 * Model (sabit — günden güne değişmez, momentum/form katmanı yoktur):
 *  - marketPower:  piyasa değerinden sıkıştırılmış (FC serisi tarzı) sabit 1-99 puan.
 *                  Düşük-orta değer aralığında (floor..pivot) hızlı yükselen, yüksek
 *                  değer aralığında (pivot..ceil) çok daha yavaş yükselen iki eğimli
 *                  bir eğri kullanılır — böylece 10 kat piyasa değeri farkı, gücü
 *                  orantısız büyütmez (örn. ~7M€ oyuncu ~81, ~70M€ oyuncu ~87 civarı).
 *  - ratingPower:  biriken sezon maç rating ortalamasından (0-10) 1-99 puan.
 *  - basePower:    marketPower + ratingPower'ın ağırlıklı karışımı (rating verisi
 *                  birikince ağırlığı kademeli artar, maks %35). Bu, oyuncunun
 *                  nihai/gösterilen gücüdür — currentPower ile aynıdır.
 *
 * Kullanım yerleri: lib/player-power-sync.ts (günlük cron yazma tarafı) ve
 * app/api/games/manager-career/players/search/route.ts (okuma tarafı, DB satırı
 * olmayan oyuncular için piyasa değerinden anlık hesaplama).
 */

export const MIN_POWER = 1
export const MAX_POWER = 99

/** Biriktirilen son maç geçmişinde tutulan maksimum eleman sayısı (istatistik amaçlı, güce etkisi yok). */
export const RECENT_MATCHES_LIMIT = 8

/** Taban güç karışımında sezon rating'ine verilebilecek maksimum ağırlık. */
const MAX_RATING_WEIGHT = 0.35
/** Bu kadar maçtan sonra rating ağırlığı maksimuma ulaşır. */
const RATING_WEIGHT_FULL_AT_COUNT = 10

/**
 * marketPower'ın kalibre edildiği iki eğimli (piecewise log) eğrinin kırılma noktaları.
 * floor..pivot arası dik bir eğim (sıradan profesyonellerden düzenli forma çıkan
 * oyunculara kadar hızlı yükselir), pivot..ceil arası çok daha yatık bir eğim
 * (yıldızlar arası fark artık büyük oranda piyasa değerinden değil, sezon rating'i
 * ve formdan gelsin diye). Değerler bu aralığın dışında kalırsa clamp edilir.
 */
const MARKET_VALUE_FLOOR_EUR = 100_000
const MARKET_VALUE_PIVOT_EUR = 8_000_000
const MARKET_VALUE_CEIL_EUR = 200_000_000

/** Kırılma noktalarındaki karşılık gelen güç puanları. */
const MARKET_POWER_AT_FLOOR = 50
const MARKET_POWER_AT_PIVOT = 82
const MARKET_POWER_AT_CEIL = 90

/** ratingPower doğrusal ölçeğinin kalibre edildiği alt/üst sınır (API-Football 0-10 rating). */
const RATING_FLOOR = 3.0
const RATING_CEIL = 10.0

export function clampPower(value: number): number {
  return Math.max(MIN_POWER, Math.min(MAX_POWER, Math.round(value)))
}

/** Bir maçtaki gerçek performans — cron tarafından API-Football'dan çekilip biriktirilir. */
export type MatchPerformance = {
  fixtureId: number
  teamId?: number
  teamName?: string
  /** ISO tarih string'i */
  date: string
  /** API-Football maç rating'i (0-10), rating verilmemişse null */
  rating: number | null
  goals: number
  assists: number
  minutes: number
  position?: string | null
  shots?: number | null
  shotsOn?: number | null
  passes?: number | null
  passesAccuracy?: number | null
  tackles?: number | null
  dribbles?: number | null
  saves?: number | null
  goalsConceded?: number | null
  keyPasses?: number | null
  interceptions?: number | null
  blocks?: number | null
  duelsTotal?: number | null
  duelsWon?: number | null
  dribblesSuccess?: number | null
}

/**
 * Piyasa değerinden (euro) sabit, iki eğimli (piecewise log) 1-99 taban puan üretir.
 * Sabit ölçek kullanılır (havuza göre relatif değil) — böylece bir oyuncunun
 * gücü sadece başka oyuncuların değeri değişti diye kaymaz.
 *
 * floor..pivot arası dik, pivot..ceil arası yatık eğim: ör. ~7M€ oyuncu ile
 * ~70M€ oyuncu arasındaki fark artık ~27 puan değil, ~6 puan civarında olur —
 * yıldızlar arası ayrım daha çok sezon rating'i ve formdan gelir.
 */
export function marketPowerFromValue(valueEur: number | null | undefined): number | null {
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

/** Biriken sezon rating ortalamasından (0-10) doğrusal 1-99 taban puan üretir. */
export function ratingPowerFromAverage(avgRating: number | null | undefined): number | null {
  if (avgRating === null || avgRating === undefined || !Number.isFinite(avgRating)) {
    return null
  }
  const clampedRating = Math.max(RATING_FLOOR, Math.min(RATING_CEIL, avgRating))
  const ratio = (clampedRating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR)
  return clampPower(MIN_POWER + (MAX_POWER - MIN_POWER) * ratio)
}

/** seasonRatingSum/seasonRatingCount'tan ortalama rating çıkarır, hiç maç yoksa null döner. */
export function seasonRatingAverage(sum: number, count: number): number | null {
  if (!count || count <= 0) return null
  return sum / count
}

/**
 * Taban güç: marketPower + ratingPower'ın ağırlıklı karışımı.
 * Rating verisi az iken piyasa değeri ağır basar; sezon ilerleyip maç sayısı
 * arttıkça rating'in ağırlığı kademeli olarak (maks %35) artar.
 */
export function computeBasePower(params: {
  valueEur: number | null | undefined
  seasonRatingSum: number
  seasonRatingCount: number
}): number | null {
  const market = marketPowerFromValue(params.valueEur)
  const avgRating = seasonRatingAverage(params.seasonRatingSum, params.seasonRatingCount)
  const rating = ratingPowerFromAverage(avgRating)

  if (market === null && rating === null) return null
  if (market === null) return rating
  if (rating === null) return market

  const ratingWeight = Math.min(params.seasonRatingCount / RATING_WEIGHT_FULL_AT_COUNT, 1) * MAX_RATING_WEIGHT
  return clampPower(market * (1 - ratingWeight) + rating * ratingWeight)
}

/** Nihai, gösterilen güç puanı — sabit basePower ile aynıdır (momentum/form katmanı kaldırıldı). */
export function computeCurrentPower(basePower: number | null): number | null {
  if (basePower === null) return null
  return clampPower(basePower)
}

/**
 * DB'de güç satırı olmayan oyuncular için piyasa değerinden anlık (canlı) puan.
 * Form/rating verisi yok — sadece marketPower döner.
 */
export function computeLivePowerFromMarketValue(valueEur: number | null | undefined): number | null {
  return marketPowerFromValue(valueEur)
}

/**
 * Yeni bir maç performansını mevcut son-maçlar listesine ekler; en yeni önde
 * olacak şekilde sıralar ve RECENT_MATCHES_LIMIT'e kırpar. Aynı fixtureId zaten
 * varsa (idempotency güvencesi normalde processed-fixture tablosunda sağlanır,
 * bu ek bir koruma katmanıdır) tekrar eklenmez.
 */
export function addMatchToRecent(existing: MatchPerformance[], newMatch: MatchPerformance): MatchPerformance[] {
  if (existing.some((m) => m.fixtureId === newMatch.fixtureId)) {
    return existing
  }
  const updated = [newMatch, ...existing]
  updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return updated.slice(0, RECENT_MATCHES_LIMIT)
}
