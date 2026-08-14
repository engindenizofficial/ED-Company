import { NextResponse } from "next/server"
import { getCachedPrediction } from "@/lib/redis"

export const dynamic = "force-dynamic"

/**
 * Sadece cache'den tahmin döndürür — yeni tahmin OLUŞTURMAZ.
 * Canlı ve bitmiş maçlar için kullanılır.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  const cached = await getCachedPrediction(fixtureId)
  if (!cached) {
    return NextResponse.json({ error: "Bu maç için kayıtlı tahmin bulunamadı." }, { status: 404 })
  }

  return NextResponse.json(cached)
}
