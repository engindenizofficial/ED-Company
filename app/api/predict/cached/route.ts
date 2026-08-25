import { NextResponse } from "next/server"
import { getCachedPrediction, isPredictionInProgress } from "@/lib/redis"

export const dynamic = "force-dynamic"

/**
 * Sadece cache'den tahmin döndürür — yeni tahmin OLUŞTURMAZ.
 * Canlı ve bitmiş maçlar için kullanılır. Ayrıca istemcinin (bkz.
 * contexts/match-context.tsx `triggerPrediction`) arka planda çalışan bir
 * tahmini poll edebilmesi için: henüz cache'de sonuç yoksa ama /api/predict
 * ile başlatılmış bir işlem hâlâ sürüyorsa 202 "processing" döner.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  const cached = await getCachedPrediction(fixtureId)
  if (cached) return NextResponse.json(cached)

  const inProgress = await isPredictionInProgress(fixtureId)
  if (inProgress) {
    return NextResponse.json({ status: "processing", fixtureId }, { status: 202 })
  }

  return NextResponse.json({ error: "Bu maç için kayıtlı tahmin bulunamadı." }, { status: 404 })
}
