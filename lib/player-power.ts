/**
 * Oyuncu güç motoru — saf hesaplama fonksiyonları (yan etkisiz, DB/API'ye dokunmaz).
 *
 * Model:
 *  - marketPower:  piyasa değerinden sıkıştırılmış (FC serisi tarzı) sabit 1-99 puan.
 *                  Düşük-orta değer aralığında (floor..pivot) hızlı yükselen, yüksek
 *                  değer aralığında (pivot..ceil) çok daha yavaş yükselen iki eğimli
 *                  bir eğri kullanılır — böylece 10 kat piyasa değeri farkı, gücü
 *                  orantısız büyütmez (örn. ~7M€ oyuncu ~81, ~70M€ oyuncu ~87 civarı).
 *  - ratingPower:  biriken sezon maç rating ortalamasından (0-10) 1-99 puan.
 *  - basePower:    marketPower + ratingPower'ın ağırlıklı karışımı (rating verisi
 *                  birikince ağırlığı kademeli artar, maks %35).
 *  - formModifier: son ~8 maçın üstel azalan ağırlıklı etkisi, -10..+10 aralığında.
 *                  (Örn. "Osimhen 2 gün önce 2 gol attı" → bu maç yüksek ağırlıkla
 *                  formModifier'ı yukarı çeker.)
 *  - currentPower: clamp(basePower + formModifier, 1, 99) — nihai, gösterilen puan.
 *
 * Kullanım yerleri: lib/player-power-sync.ts (günlük cron yazma tarafı) ve
 * app/api/games/manager-career/players/search/route.ts (okuma tarafı, DB satırı
 * olmayan oyuncular için piyasa değerinden anlık hesaplama).
 */

export const MIN_POWER = 1
export const MAX_POWER = 99

/** Form hesaplamasında dikkate alınan maksimum son maç sayısı. */
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

/** Bir maçın "nötr" (ortalama) rating referansı — form deltası bu değere göre hesaplanır. */
const NEUTRAL_MATCH_RATING = 6.5
/** Form deltasına eklenen gol/asist bonusu (rating zaten kısmen bunu yansıtsa da örneği güçlendirir). */
const GOAL_BONUS = 0.3
const ASSIST_BONUS = 0.15
/** Tek bir maçın form deltasına üst sınır — bir maçın etkisini sınırsız büyütmemek için. */
const MAX_MATCH_DELTA = 3.0
/** En yeni maçtan başlayarak her adımda ağırlığın azalma çarpanı. */
const FORM_DECAY = 0.75
/** Ortalama form deltasının nihai -10..+10 modifier'a çevrilme çarpanı. */
const FORM_SCALE = 4

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
  clearances?: number | null
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

/**
 * Son maçların (en yeni önde, en fazla RECENT_MATCHES_LIMIT eleman) üstel azalan
 * ağırlıklı etkisinden -10..+10 aralığında bir form modifier üretir.
 * Süre almayan (minutes=0) veya rating'i olmayan maçlar sayılmaz.
 */
export function computeFormModifier(recentMatches: MatchPerformance[]): number {
  const relevant = recentMatches.filter((m) => m.minutes > 0 && m.rating !== null).slice(0, RECENT_MATCHES_LIMIT)
  if (relevant.length === 0) return 0

  let weightedDeltaSum = 0
  let weightSum = 0

  relevant.forEach((match, index) => {
    const rating = match.rating as number
    const pos = match.position?.toUpperCase() ?? ""
    const attacking = match.goals * GOAL_BONUS + match.assists * ASSIST_BONUS + (match.shotsOn ?? 0) * 0.08
    const creating = (match.assists ?? 0) * ASSIST_BONUS + (match.passesAccuracy ?? 0) * 0.012 + (match.keyPasses ?? 0) * 0.06
    const defending = (match.tackles ?? 0) * 0.06 + (match.interceptions ?? 0) * 0.05 + (match.clearances ?? 0) * 0.025
    const goalkeeping = (match.saves ?? 0) * 0.07 - (match.goalsConceded ?? 0) * 0.12
    const bonus = pos === "G" || pos === "GK" ? goalkeeping : pos === "D" || pos === "DF" ? defending + creating * 0.35 : pos === "M" || pos === "MF" ? creating + attacking * 0.35 : attacking
    const rawDelta = rating - NEUTRAL_MATCH_RATING + Math.min(bonus, MAX_MATCH_DELTA)
    const delta = Math.max(-MAX_MATCH_DELTA, Math.min(MAX_MATCH_DELTA, rawDelta))

    const decayWeight = Math.pow(FORM_DECAY, index)
    weightedDeltaSum += decayWeight * delta
    weightSum += decayWeight
  })

  const avgDelta = weightSum > 0 ? weightedDeltaSum / weightSum : 0
  return Math.max(-10, Math.min(10, Math.round(avgDelta * FORM_SCALE)))
}

/** Nihai, gösterilen güç puanı. */
export function computeCurrentPower(basePower: number | null, formModifier: number): number | null {
  if (basePower === null) return null
  return clampPower(basePower + formModifier)
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
