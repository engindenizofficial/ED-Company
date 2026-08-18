import { getAllTimePredictionResults } from "./redis"

// ---------------------------------------------------------------------------
// Adaptif model ağırlıklandırma
// ---------------------------------------------------------------------------
// Eskiden her providerın ağırlığı sabit kodluydu (openai: 2.0, google: 1.5,
// xai: 1.5) ve gerçek isabet oranından tamamen bağımsızdı. Uygulama zaten her
// çözümlenmiş tahmin için modelResults[].sideCorrect kaydediyor — bu dosya o
// veriyi kullanarak ağırlıkları geçmiş performansa göre otomatik ayarlar.
//
// Cold start koruması: bir provider için yeterli örnek yoksa (MIN_SAMPLES'ın
// altında) ağırlık statik varsayılana yakın kalır; örnek sayısı arttıkça
// (FULL_SAMPLES'a kadar) ağırlık kademeli olarak tamamen veri odaklı hale gelir.
// ---------------------------------------------------------------------------

/** Statik varsayılan ağırlıklar — yeni providerlar veya yetersiz veri için taban değer. */
export const STATIC_WEIGHTS: Record<string, number> = {
  openai: 2.0,
  google: 1.5,
  xai: 1.5,
  // Poisson istatistik modeli — LLM'lerden bağımsız, gol ortalamalarına dayalı
  // veri odaklı tahmin. Skor tahmininde LLM'lerden daha isabetli olması
  // beklendiği için başlangıçta orta-yüksek bir taban ağırlıkla başlar.
  poisson: 1.8,
}

/** Bir providerın ağırlığının veriye dayanmaya başlaması için gereken minimum çözümlenmiş tahmin sayısı. */
const MIN_SAMPLES = 8
/** Bu örnek sayısına ulaşınca ağırlık tamamen dinamik hale gelir (0→1 lineer harman). */
const FULL_SAMPLES = 30
/** Son kaç çözümlenmiş tahmine bakılacağı — çok eski performans güncel formu yansıtmaz. */
const RESULT_WINDOW = 60

function providerOf(model: string): string {
  return model.split("/")[0]
}

/**
 * isabet oranı (0-1) → ağırlık (0.5-3.5) dönüşümü.
 * 3 sonuçlu (ev/deplasman/berabere) bir tahminde şans seviyesi ~%33'tür,
 * bu da ~1.5 ağırlık verir (statik varsayılanla aynı mertebede) — böylece
 * şans seviyesinde performans gösteren bir model cezalandırılmaz, sadece
 * gerçekten iyi/kötü performans ağırlığı belirgin şekilde değiştirir.
 */
function accuracyToWeight(accuracy: number): number {
  return Math.min(3.5, Math.max(0.5, 0.5 + accuracy * 3))
}

export interface ModelWeightInfo {
  weight: number
  /** null = yeterli veri yok, statik ağırlık kullanılıyor */
  accuracy: number | null
  sampleCount: number
}

/**
 * Tüm zamanlar başarı panelinden (ed:prediction-results:all) son RESULT_WINDOW
 * çözümlenmiş tahmine bakarak her provider için "kazanan tahmini" isabet
 * oranını hesaplar ve buna göre ağırlık üretir.
 */
export async function getAdaptiveWeights(): Promise<Record<string, ModelWeightInfo>> {
  const allResults = await getAllTimePredictionResults()

  const recent = [...allResults].sort((a, b) => b.savedAt - a.savedAt).slice(0, RESULT_WINDOW)

  const byProvider: Record<string, { correct: number; total: number }> = {}
  for (const result of recent) {
    if (!result.modelResults) continue
    for (const mr of result.modelResults) {
      const provider = providerOf(mr.model)
      if (!byProvider[provider]) byProvider[provider] = { correct: 0, total: 0 }
      byProvider[provider].total += 1
      if (mr.sideCorrect) byProvider[provider].correct += 1
    }
  }

  const out: Record<string, ModelWeightInfo> = {}
  const providers = new Set([...Object.keys(STATIC_WEIGHTS), ...Object.keys(byProvider)])

  for (const provider of providers) {
    const stats = byProvider[provider]
    const staticWeight = STATIC_WEIGHTS[provider] ?? 1.0

    if (!stats || stats.total < MIN_SAMPLES) {
      out[provider] = {
        weight: staticWeight,
        accuracy: stats && stats.total > 0 ? stats.correct / stats.total : null,
        sampleCount: stats?.total ?? 0,
      }
      continue
    }

    const accuracy = stats.correct / stats.total
    const dynamicWeight = accuracyToWeight(accuracy)
    const confidence = Math.min(1, (stats.total - MIN_SAMPLES) / (FULL_SAMPLES - MIN_SAMPLES))
    const weight = staticWeight * (1 - confidence) + dynamicWeight * confidence

    out[provider] = { weight, accuracy, sampleCount: stats.total }
  }

  return out
}

// ---------------------------------------------------------------------------
// Skor-özel adaptif ağırlıklandırma
// ---------------------------------------------------------------------------
// getAdaptiveWeights() sadece "kazanan taraf" (sideCorrect) isabetine bakıyor
// ve o ağırlık hem taraf oylamasında hem de skor ortalamasında kullanılıyordu.
// Ancak bir modelin kazananı doğru bilmesi, skorunun isabetli olduğu anlamına
// gelmez (örn. doğru kazananı ama 4-0 yerine 1-0 tahmin edebilir). Bu yüzden
// skor ortalaması için ayrı bir ağırlık üretiyoruz: exact scoreCorrect yerine
// ortalama gol hatası (|Δhome| + |Δaway|) kullanıyoruz çünkü tam skor tutturma
// çok nadir olduğundan (şans seviyesi ~%10) örnek sayısı azken çok gürültülü
// bir sinyal olurdu; ortalama hata daha yumuşak ve daha çabuk anlamlı hale gelir.
// ---------------------------------------------------------------------------

/** Ortalama gol hatası (0 = mükemmel) → ağırlık (0.5-3.5) dönüşümü. */
function scoreErrorToWeight(avgError: number): number {
  return Math.min(3.5, Math.max(0.5, 3.5 - avgError))
}

export interface ScoreWeightInfo {
  weight: number
  /** null = yeterli veri yok, statik ağırlık kullanılıyor */
  avgError: number | null
  sampleCount: number
}

export async function getAdaptiveScoreWeights(): Promise<Record<string, ScoreWeightInfo>> {
  const allResults = await getAllTimePredictionResults()
  const recent = [...allResults].sort((a, b) => b.savedAt - a.savedAt).slice(0, RESULT_WINDOW)

  const byProvider: Record<string, { totalError: number; total: number }> = {}
  for (const result of recent) {
    if (!result.modelResults) continue
    for (const mr of result.modelResults) {
      const provider = providerOf(mr.model)
      if (!byProvider[provider]) byProvider[provider] = { totalError: 0, total: 0 }
      const error = Math.abs(mr.homeScore - result.actualHome) + Math.abs(mr.awayScore - result.actualAway)
      byProvider[provider].totalError += error
      byProvider[provider].total += 1
    }
  }

  const out: Record<string, ScoreWeightInfo> = {}
  const providers = new Set([...Object.keys(STATIC_WEIGHTS), ...Object.keys(byProvider)])

  for (const provider of providers) {
    const stats = byProvider[provider]
    const staticWeight = STATIC_WEIGHTS[provider] ?? 1.0

    if (!stats || stats.total < MIN_SAMPLES) {
      out[provider] = {
        weight: staticWeight,
        avgError: stats && stats.total > 0 ? stats.totalError / stats.total : null,
        sampleCount: stats?.total ?? 0,
      }
      continue
    }

    const avgError = stats.totalError / stats.total
    const dynamicWeight = scoreErrorToWeight(avgError)
    const confidence = Math.min(1, (stats.total - MIN_SAMPLES) / (FULL_SAMPLES - MIN_SAMPLES))
    const weight = staticWeight * (1 - confidence) + dynamicWeight * confidence

    out[provider] = { weight, avgError, sampleCount: stats.total }
  }

  return out
}
