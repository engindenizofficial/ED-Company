import { NextResponse } from "next/server"
import { getPredictionResults, savePredictionResult } from "@/lib/redis"
import type { PredictionResult } from "@/lib/types"

export const dynamic = "force-dynamic"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

/** Günün tüm tahmin sonuçlarını döndürür */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? todayTR()

  const results = await getPredictionResults(date)
  return NextResponse.json({ date, results })
}

/** Yeni bir tahmin sonucu kaydeder (maç bittikten sonra otomatik çağrılır) */
export async function POST(request: Request) {
  let body: Partial<PredictionResult>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }

  const {
    fixtureId,
    homeName,
    awayName,
    predictedHome,
    predictedAway,
    predictedWinner,
    actualHome,
    actualAway,
    actualWinner,
    confidence,
  } = body

  if (
    fixtureId == null ||
    homeName == null ||
    awayName == null ||
    predictedHome == null ||
    predictedAway == null ||
    predictedWinner == null ||
    actualHome == null ||
    actualAway == null ||
    actualWinner == null ||
    confidence == null
  ) {
    return NextResponse.json({ error: "Eksik alanlar var." }, { status: 400 })
  }

  const scoreCorrect = predictedHome === actualHome && predictedAway === actualAway
  const sideCorrect = predictedWinner === actualWinner

  const result: PredictionResult = {
    fixtureId,
    homeName,
    awayName,
    predictedHome,
    predictedAway,
    predictedWinner,
    actualHome,
    actualAway,
    actualWinner,
    scoreCorrect,
    sideCorrect,
    confidence,
    savedAt: Date.now(),
  }

  const date = todayTR()
  await savePredictionResult(date, result)

  return NextResponse.json({ ok: true, result })
}
