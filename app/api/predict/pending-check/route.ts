import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getPendingPredictions, getCachedPrediction, removePendingPrediction, savePredictionResult, getAllTimePredictionResults, addPendingPrediction } from "@/lib/redis"
import type { PredictionResult, MatchPrediction } from "@/lib/types"

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

/** Redis'teki ed:prediction:* key'lerini tara, henüz sonuçlanmamış olanları bul */
async function discoverOrphanedPredictions(): Promise<{ fixtureId: number; pred: MatchPrediction }[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return []

  try {
    const redis = new Redis({ url, token })
    const alreadyResolved = await getAllTimePredictionResults()
    const resolvedIds = new Set(alreadyResolved.map((r) => r.fixtureId))

    let cursor = 0
    const keys: string[] = []
    do {
      const [nextCursor, batch] = await redis.scan(cursor, { match: "ed:prediction:*", count: 100 })
      cursor = Number(nextCursor)
      keys.push(...(batch as string[]))
    } while (cursor !== 0)

    const orphans: { fixtureId: number; pred: MatchPrediction }[] = []
    for (const key of keys) {
      const match = key.match(/ed:prediction:(\d+)$/)
      if (!match) continue
      const fixtureId = Number(match[1])
      if (resolvedIds.has(fixtureId)) continue // Zaten başarı panelinde
      const pred = await redis.get<MatchPrediction>(key)
      if (pred) orphans.push({ fixtureId, pred })
    }
    return orphans
  } catch {
    return []
  }
}

/**
 * Bekleyen tahminlerin her birini API-Football'dan kontrol eder, bitmiş
 * maçları başarı paneline işler ve bekleyen listesinden çıkarır. Hem manuel
 * POST çağrısından hem de QStash'in GET cron çağrısından ortak kullanılır.
 */
async function checkPendingPredictions() {
  // Her çağrıda orphan taraması yap — pending listesinde olmayan tahminleri ekle
  const orphans = await discoverOrphanedPredictions()
  for (const { fixtureId, pred } of orphans) {
    await addPendingPrediction({
      fixtureId,
      date: todayTR(),
      homeName: pred.homeName ?? "Ev Sahibi",
      awayName: pred.awayName ?? "Deplasman",
    })
  }

  const pending = await getPendingPredictions()
  if (pending.length === 0) {
    return { checked: 0, resolved: [] as PredictionResult[] }
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

  return { checked: pending.length, resolved }
}

/**
 * GET /api/predict/pending-check
 * QStash schedule'ından (bkz. scripts/setup-qstash-schedules.mjs) düzenli
 * olarak çağrılır — böylece adaptif ağırlıklar, sitede o an açık bir
 * sekme/ziyaretçi olmasa da sunucu tarafında güvenilir şekilde güncellenir.
 * CRON_SECRET ile korunur, aynı /api/cron/* route'larındaki desen.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { checked, resolved } = await checkPendingPredictions()
  return NextResponse.json({ checked, resolved })
}

/**
 * POST /api/predict/pending-check
 * Yenile butonuna basıldığında (veya 30 saniyelik otomatik yenilemede)
 * istemciden çağrılır. Redis'teki bekleyen tahminlerin her birini
 * API-Football'dan kontrol eder. Bitmiş maçları başarı paneline işler ve
 * bekleyen listesinden çıkarır. Pending listesinde olmayan eski tahminleri
 * de (ed:prediction:* taramasıyla) kontrol eder.
 */
