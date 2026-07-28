import { getCachedFixtures } from "@/lib/redis"
import { pollingManager, todayTR } from "@/lib/polling-manager"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function fixtureFingerprint(fixtures: Fixture[]): string {
  return fixtures
    .map((f) => `${f.id}:${f.goalsHome}-${f.goalsAway}:${f.statusShort}:${f.elapsed}`)
    .join("|")
}

export async function GET() {
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

      // İlk veriyi hemen Redis'ten gönder
      const initial = await getCachedFixtures(todayTR())
      if (initial && !closed) {
        lastFingerprint = fixtureFingerprint(initial.fixtures)
        send("fixtures", initial)
      }

      // Polling manager her güncellemede bu callback'i tetikler;
      // stream sadece Redis'i okur — API'ye doğrudan çarpmaz.
      const unsubscribe = pollingManager.subscribeFixtures(async () => {
        if (closed) { unsubscribe(); return }
        const fresh = await getCachedFixtures(todayTR())
        if (!fresh) return
        const fp = fixtureFingerprint(fresh.fixtures)
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          send("fixtures", fresh)
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
