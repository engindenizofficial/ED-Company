import { getFixturesByDate } from "@/lib/api-football"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"
// SSE bağlantısı uzun süreceği için max süreyi artır
export const maxDuration = 300

/** Türkiye saatiyle bugünün tarihi (YYYY-MM-DD). */
function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

/** İki fixture dizisini karşılaştırmak için özet string üretir. */
function fixtureFingerprint(fixtures: Fixture[]): string {
  return fixtures
    .map((f) => `${f.id}:${f.goalsHome}-${f.goalsAway}:${f.statusShort}:${f.elapsed}`)
    .join("|")
}

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let lastFingerprint = ""
      let closed = false

      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      // İlk veriyi hemen gönder
      try {
        const date = todayTR()
        const fixtures = await getFixturesByDate(date)
        lastFingerprint = fixtureFingerprint(fixtures)
        send("fixtures", { date, fixtures, cachedAt: Date.now() })
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Bilinmeyen hata" })
      }

      // Her 10 saniyede bir kontrol et, değişim varsa push et
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          return
        }
        try {
          const date = todayTR()
          const fixtures = await getFixturesByDate(date)
          const fingerprint = fixtureFingerprint(fixtures)

          if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint
            send("fixtures", { date, fixtures, cachedAt: Date.now() })
          } else {
            // Değişim yoksa sadece heartbeat gönder (bağlantı canlı kalsın)
            send("heartbeat", { ts: Date.now() })
          }
        } catch (err) {
          send("error", { message: err instanceof Error ? err.message : "Bilinmeyen hata" })
        }
      }, 10_000)

      // Stream kapanınca interval'i temizle
      return () => {
        closed = true
        clearInterval(interval)
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
