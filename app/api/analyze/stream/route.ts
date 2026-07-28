import { getCachedLive, getCachedFixturePlayerStats } from "@/lib/redis"
import { pollingManager, LIVE_STATUSES } from "@/lib/polling-manager"
import type { AnalysisResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let lastFingerprint = ""

      function send(event: string, data: unknown) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      async function readFromCache(): Promise<AnalysisResponse | null> {
        const live = await getCachedLive(fixtureId)
        if (!live) return null
        const playerStats = await getCachedFixturePlayerStats(fixtureId)
        return { live, playerStats: playerStats ?? [], liveCachedAt: Date.now() }
      }

      // İlk veriyi hemen Redis'ten gönder
      const initial = await readFromCache()
      if (initial && !closed) {
        lastFingerprint = fingerprint(initial)
        send("analysis", initial)
      }

      const isLiveMatch = initial
        ? LIVE_STATUSES.has(initial.live.fixture.statusShort)
        : false

      if (!isLiveMatch) {
        // Canlı değil — sadece heartbeat, API'ye çarpmadan bağlantıyı koru
        const hbInterval = setInterval(() => {
          if (closed) { clearInterval(hbInterval); return }
          send("heartbeat", { ts: Date.now() })
        }, 30_000)
        return () => { closed = true; clearInterval(hbInterval) }
      }

      // Canlı maç — polling manager'a abone ol.
      // Manager API'yi çeker, Redis'e yazar, sonra bu callback'i tetikler.
      const unsubscribe = pollingManager.subscribeAnalysis(fixtureId, async (updatedId) => {
        if (updatedId !== fixtureId || closed) return
        const fresh = await readFromCache()
        if (!fresh) return
        const fp = fingerprint(fresh)
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          send("analysis", fresh)
        } else {
          send("heartbeat", { ts: Date.now() })
        }
      })

      return () => {
        closed = true
        unsubscribe()
      }
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
