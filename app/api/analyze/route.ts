import { NextResponse } from "next/server"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import { getCachedLive, setCachedLive, getLockedPrediction } from "@/lib/redis"
import type { AnalysisResponse, LiveMatchData } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Canlı maç durumlarını tanımlayan set. Sadece bu durumdaki maçlarda
// refresh=1 Redis'i atlayarak API'ye gider.
const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"])

// Powers the detail panel: LIVE API-Football data (refreshable) + the LOCKED
// Gemini prediction (generated once, never changes).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))
  const refresh = searchParams.get("refresh") === "1"
  // Client tarafından maçın anlık durumunu alıyoruz (opsiyonel).
  const statusParam = searchParams.get("status") ?? ""

  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId gerekli." }, { status: 400 })
  }

  // refresh=1 yalnızca gerçekten canlı maçlarda Redis'i atlar.
  // Oynanmamış (NS, TBD) veya bitmiş (FT, AET, PEN vb.) maçlar için
  // refresh isteği gelse bile Redis cache'den servis edilir.
  const isLive = LIVE_STATUSES.has(statusParam.toUpperCase())
  const shouldBypassCache = refresh && isLive

  try {
    // ---- Live data: reuse the shared Redis copy unless refreshing ----
    let live: LiveMatchData | null = null
    let liveCachedAt = Date.now()

    if (!shouldBypassCache) {
      const cached = await getCachedLive(fixtureId)
      if (cached) live = cached
    }

    if (!live) {
      const fixture = await getFixtureById(fixtureId)
      if (!fixture) {
        return NextResponse.json({ error: "Maç bulunamadı." }, { status: 404 })
      }
      live = await getLiveMatchData(fixture)
      liveCachedAt = Date.now()
      await setCachedLive(fixtureId, live)
    }

    // ---- Gemini prediction: only serve if already locked in Redis.
    // We never trigger a new Gemini call from here — the card queue handles
    // generation. This avoids 429s when the panel is opened mid-queue.
    const prediction = await getLockedPrediction(fixtureId)

    const payload: AnalysisResponse = {
      live,
      prediction: prediction ?? null,
      liveCachedAt,
      predictionLocked: !!prediction,
    }
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] analyze API failed:", message)

    // Best-effort fallback: serve whatever live data we last saved.
    const cachedLive = await getCachedLive(fixtureId)
    if (cachedLive) {
      const prediction = await getLockedPrediction(fixtureId)
      return NextResponse.json({
        live: cachedLive,
        prediction: prediction ?? null,
        liveCachedAt: Date.now(),
        predictionLocked: !!prediction,
        stale: true,
      } satisfies AnalysisResponse)
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
