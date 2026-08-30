import { NextResponse } from "next/server"
import { getPredictionResults, getAllTimePredictionResults, savePredictionResult } from "@/lib/redis"
import type { PredictionResult } from "@/lib/types"

export const dynamic = "force-dynamic"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

/** Tüm tahmin sonuçlarını döndürür (all=1 parametresiyle tüm zamanlar) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const all = searchParams.get("all") === "1"

  if (all) {
    const results = await getAllTimePredictionResults()
    return NextResponse.json({ results })
  }

  const date = searchParams.get("date") ?? todayTR()
  const results = await getPredictionResults(date)
  return NextResponse.json({ date, results })
}

/** Yeni bir tahmin sonucu kaydeder (maç bittikten sonra otomatik çağrılır) */
export async function POST(request: Request) {
  let body: Partial<PredictionResult> & { modelVotes?: Array<{ model: string; label?: string; winner: "home" | "away" | "draw"; homeScore: number; awayScore: number }> }
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
    modelVotes,
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

  // Her modelin bireysel doğruluğunu hesapla
  const modelResults = Array.isArray(modelVotes)
    ? modelVotes.map((v) => ({
        model: v.model ?? "",
        label: v.label ?? v.model ?? "",
        winner: v.winner,
        sideCorrect: v.winner === actualWinner,
        homeScore: v.homeScore,
        awayScore: v.awayScore,
        scoreCorrect: v.homeScore === actualHome && v.awayScore === actualAway,
      }))
    : undefined

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
    modelResults,
  }

  const date = todayTR()
  await savePredictionResult(date, result)

  return NextResponse.json({ ok: true, result })
}
