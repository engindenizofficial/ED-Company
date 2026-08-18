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
