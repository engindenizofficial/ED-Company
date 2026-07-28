import { getFixtureById, getLiveMatchData, getFixturePlayerStats } from "@/lib/api-football"
import { getCachedLive, setCachedLive, getCachedFixturePlayerStats, setCachedFixturePlayerStats } from "@/lib/redis"
import type { AnalysisResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])
const POLL_INTERVAL_MS = 10_000

/** Analiz verisinden değişim tespiti için parmak izi üretir. */
function fingerprint(data: AnalysisResponse): string {
  const { fixture } = data.live
  const events = data.live.events.length
  const stats = data.live.statistics.length > 0 ? JSON.stringify(data.live.statistics) : ""
  return `${fixture.statusShort}|${fixture.status}|${fixture.goalsHome}|${fixture.goalsAway}|${events}|${stats}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))

  if (!fixtureId || isNaN(fixtureId)) {
    return new Response("fixtureId gerekli.", { status: 400 })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: string) {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }

      async function fetchAnalysis(): Promise<AnalysisResponse | null> {
        try {
          const fixture = await getFixtureById(fixtureId)
          if (!fixture) return null
          const live = await getLiveMatchData(fixture)
          const isLive = LIVE_STATUSES.has(live.fixture.statusShort)
          const ttl = isLive ? 8 : 60 * 60 * 6
          await setCachedLive(fixtureId, live, ttl)

          let playerStats = await getCachedFixturePlayerStats(fixtureId)
          if (!playerStats) {
            playerStats = await getFixturePlayerStats(fixtureId)
            await setCachedFixturePlayerStats(fixtureId, playerStats)
          }

          return { live, playerStats, liveCachedAt: Date.now() }
        } catch {
          // Hata durumunda cache'den dön
          const cached = await getCachedLive(fixtureId)
          if (!cached) return null
          const cachedPlayerStats = await getCachedFixturePlayerStats(fixtureId)
          return { live: cached, playerStats: cachedPlayerStats ?? [], liveCachedAt: Date.now(), stale: true }
        }
      }

      let lastFingerprint = ""

      // İlk veriyi hemen gönder
      const initial = await fetchAnalysis()
      if (initial && !closed) {
        lastFingerprint = fingerprint(initial)
        send("analysis", JSON.stringify(initial))
      }

      // Canlı değilse polling yapmaya gerek yok — bağlantıyı heartbeat ile canlı tut
      const isLiveMatch = initial
        ? LIVE_STATUSES.has(initial.live.fixture.statusShort)
        : false

      if (!isLiveMatch) {
        // Maç canlı değil; sadece heartbeat gönder, API'ye tekrar çarpmadan bağlantıyı koru
        while (!closed) {
          await new Promise<void>((r) => setTimeout(r, 30_000))
          if (!closed) send("heartbeat", "ping")
        }
        return
      }

      // Canlı maç — polling döngüsü
      while (!closed) {
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS))
        if (closed) break

        const data = await fetchAnalysis()
        if (!data || closed) continue

        const fp = fingerprint(data)
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          send("analysis", JSON.stringify(data))
          // Maç bitti mi? Polling'i durdur
          if (!LIVE_STATUSES.has(data.live.fixture.statusShort)) break
        } else {
          send("heartbeat", "ping")
        }
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
