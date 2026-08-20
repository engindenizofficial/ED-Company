import { getAllTimePredictionResults } from "./redis"

// ---------------------------------------------------------------------------
// Confidence kalibrasyonu
// ---------------------------------------------------------------------------
// LLM'lerin ürettiği 0-100 güven skoru hiçbir gerçek isabet oranına göre
// ölçülmüyordu — modeller genelde "overconfident" olur (örn. %85 dediğinde
// gerçekte %60 tutması gibi). Bu dosya, geçmiş çözümlenmiş tahminleri güven
// aralığına (bucket) göre gruplayıp her aralık için GERÇEK isabet oranını
// (sideCorrect yüzdesi) hesaplar. Yeni bir tahmin geldiğinde, modelin ham
// güven skoru bu geçmiş eğriye göre düzeltilir (calibrateConfidence).
//
// Cold start koruması: bir bucket için yeterli örnek yoksa (MIN_BUCKET_SAMPLES
// altında) o aralıkta düzeltme yapılmaz, ham skor olduğu gibi kullanılır;
// örnek sayısı arttıkça (FULL_BUCKET_SAMPLES'a kadar) düzeltme kademeli olarak
// tamamen veri odaklı hale gelir (model-weights.ts'teki aynı harman deseni).
// ---------------------------------------------------------------------------

/** Bucket genişliği (puan) — örn. 10 → [0-10), [10-20), ... [90-100] */
const BUCKET_SIZE = 10
/** Bir bucket'ın düzeltmeye başlaması için gereken minimum çözümlenmiş tahmin sayısı. */
const MIN_BUCKET_SAMPLES = 6
/** Bu örnek sayısına ulaşınca düzeltme tamamen veri odaklı hale gelir. */
const FULL_BUCKET_SAMPLES = 20
/** Son kaç çözümlenmiş tahmine bakılacağı — çok eski veri güncel modelleri yansıtmaz. */
const RESULT_WINDOW = 120

function bucketOf(confidence: number): number {
  return Math.min(90, Math.floor(confidence / BUCKET_SIZE) * BUCKET_SIZE)
}

export interface CalibrationBucket {
  /** Bucket alt sınırı, örn. 70 → [70-80) aralığı */
  bucketStart: number
  /** Bu aralıkta modellerin bildirdiği ortalama ham güven skoru */
  avgReportedConfidence: number
  /** Bu aralıktaki tahminlerin GERÇEKTE tutma oranı (0-1), null = yetersiz veri */
  actualAccuracy: number | null
  sampleCount: number
}

/**
 * Tüm zamanlar başarı panelinden son RESULT_WINDOW çözümlenmiş tahmine bakarak
 * her güven aralığı (bucket) için gerçek isabet oranını hesaplar. Ensemble'ın
 * nihai `confidence` alanı ve `sideCorrect` alanı kullanılır — yani "bu maçta
 * bildirilen güven X iken, kazanan tarafı gerçekten doğru bilme oranı ne?"
 * sorusuna cevap verir.
 */
export async function getConfidenceCalibrationCurve(): Promise<CalibrationBucket[]> {
  const allResults = await getAllTimePredictionResults()
  const recent = [...allResults].sort((a, b) => b.savedAt - a.savedAt).slice(0, RESULT_WINDOW)

  const byBucket: Record<number, { totalConfidence: number; correct: number; total: number }> = {}
  for (const result of recent) {
    if (result.confidence == null) continue
    const bucket = bucketOf(result.confidence)
    if (!byBucket[bucket]) byBucket[bucket] = { totalConfidence: 0, correct: 0, total: 0 }
    byBucket[bucket].totalConfidence += result.confidence
    byBucket[bucket].total += 1
    if (result.sideCorrect) byBucket[bucket].correct += 1
  }

  const buckets: CalibrationBucket[] = []
  for (let start = 0; start <= 90; start += BUCKET_SIZE) {
    const stats = byBucket[start]
    buckets.push({
      bucketStart: start,
      avgReportedConfidence: stats ? stats.totalConfidence / stats.total : start + BUCKET_SIZE / 2,
      actualAccuracy: stats && stats.total > 0 ? stats.correct / stats.total : null,
      sampleCount: stats?.total ?? 0,
    })
  }
  return buckets
}

/**
 * Ham güven skorunu (0-100), o skorun düştüğü bucket'ın geçmiş gerçek isabet
 * oranına göre düzeltir. Örnek: model "%85 güven" diyor ama o aralıktaki
 * tahminler geçmişte gerçekte %60 tutmuşsa, kalibre edilmiş değer 60'a yakın
 * çıkar. Yeterli örnek yoksa ham skor olduğu gibi (küçük bir harmanla) döner.
 */
export function calibrateConfidence(rawConfidence: number, curve: CalibrationBucket[]): number {
  const bucket = curve.find((b) => b.bucketStart === bucketOf(rawConfidence))
  if (!bucket || bucket.actualAccuracy == null || bucket.sampleCount < MIN_BUCKET_SAMPLES) {
    return Math.round(rawConfidence)
  }

  const targetConfidence = bucket.actualAccuracy * 100
  const blend = Math.min(1, (bucket.sampleCount - MIN_BUCKET_SAMPLES) / (FULL_BUCKET_SAMPLES - MIN_BUCKET_SAMPLES))
  const calibrated = rawConfidence * (1 - blend) + targetConfidence * blend

  return Math.round(Math.min(100, Math.max(0, calibrated)))
}
