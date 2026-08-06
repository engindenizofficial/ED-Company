import { NextResponse } from "next/server"
import { getPendingPredictions, getCachedPrediction, removePendingPrediction, savePredictionResult } from "@/lib/redis"
import type { PredictionResult } from "@/lib/types"

export const dynamic = "force-dynamic"

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"])

function actualWinner(home: number, away: number): "home" | "away" | "draw" {
  if (home > away) return "home"
  if (away > home) return "away"
  return "draw"
}

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

/**
 * POST /api/predict/pending-check
 * Yenile butonuna basıldığında çağrılır.
 * Redis'teki bekleyen tahminlerin her birini API-Football'dan kontrol eder.
 * Bitmiş maçları başarı paneline işler ve bekleyen listesinden çıkarır.
 */
export async function POST() {
  const pending = await getPendingPredictions()

  if (pending.length === 0) {
    return NextResponse.json({ checked: 0, resolved: [] })
  }

  const resolved: PredictionResult[] = []

  await Promise.allSettled(
    pending.map(async (entry) => {
      try {
        // API-Football'dan güncel maç bilgisi çek
        const apiKey = process.env.API_FOOTBALL_KEY
        if (!apiKey) return

        const res = await fetch(
          `https://v3.football.api-sports.io/fixtures?id=${entry.fixtureId}`,
          {
            headers: { "x-apisports-key": apiKey },
            cache: "no-store",
          }
        )

        if (!res.ok) return

        const json = await res.json() as {
          response: Array<{
            fixture: { status: { short: string } }
            goals: { home: number | null; away: number | null }
            teams: {
              home: { id: number; name: string; logo: string }
              away: { id: number; name: string; logo: string }
            }
          }>
        }

        const match = json.response?.[0]
        if (!match) return

        const statusShort = match.fixture.status.short
        if (!FINISHED_STATUSES.has(statusShort)) return // Henüz bitmedi

        const actualHome = match.goals.home
        const actualAway = match.goals.away
        if (actualHome == null || actualAway == null) return

        // Cache'den tahmini al
        const pred = await getCachedPrediction(entry.fixtureId)
        if (!pred) {
          // Tahmin cache'den düşmüş ama maç bitti — bekleyen listesinden de çıkar
          await removePendingPrediction(entry.fixtureId)
          return
        }

        const winner = actualWinner(actualHome, actualAway)
        const scoreCorrect = pred.homeScore === actualHome && pred.awayScore === actualAway
        const sideCorrect = pred.winner === winner

        const modelResults = Array.isArray(pred.modelVotes)
          ? pred.modelVotes.map((v) => ({
              model: v.model,
              label: v.model,
              winner: v.winner,
              sideCorrect: v.winner === winner,
              homeScore: v.homeScore,
              awayScore: v.awayScore,
              scoreCorrect: v.homeScore === actualHome && v.awayScore === actualAway,
            }))
          : undefined

        const result: PredictionResult = {
          fixtureId: entry.fixtureId,
          homeName: entry.homeName,
          awayName: entry.awayName,
          predictedHome: pred.homeScore,
          predictedAway: pred.awayScore,
          predictedWinner: pred.winner,
          actualHome,
          actualAway,
          actualWinner: winner,
          scoreCorrect,
          sideCorrect,
          confidence: pred.confidence,
          savedAt: Date.now(),
          modelResults,
        }

        // Başarı paneline kaydet
        await savePredictionResult(todayTR(), result)
        // Bekleyen listesinden çıkar
        await removePendingPrediction(entry.fixtureId)

        resolved.push(result)
      } catch {
        // sessizce geç
      }
    })
  )

  return NextResponse.json({ checked: pending.length, resolved })
}
