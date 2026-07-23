import { NextResponse } from "next/server"
import { getFixtureById, getLiveMatchData } from "@/lib/api-football"
import { getCachedLive, setCachedLive } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/prefetch-live
 * Body: { fixtureIds: number[] }
 *
 * For each fixture ID:
 *   - Redis'te zaten varsa → atla
 *   - Yoksa API-Football'dan çek, Redis'e yaz
 *
 * Returns: { cached: number[], fetched: number[], failed: number[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const fixtureIds: number[] = Array.isArray(body?.fixtureIds) ? body.fixtureIds : []

  if (fixtureIds.length === 0) {
    return NextResponse.json({ error: "fixtureIds gerekli." }, { status: 400 })
  }

  const cached: number[] = []
  const fetched: number[] = []
  const failed: number[] = []

  // 3'erli batch'ler halinde işle, batch'ler arasında 1 saniye bekle
  const BATCH_SIZE = 3
  const BATCH_DELAY_MS = 1000

  for (let i = 0; i < fixtureIds.length; i += BATCH_SIZE) {
    const batch = fixtureIds.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (id) => {
        // Önce Redis kontrolü
        const existing = await getCachedLive(id)
        if (existing) {
          cached.push(id)
          return
        }

        // Redis'te yok — API'den çek
        try {
          const fixture = await getFixtureById(id)
          if (!fixture) {
            failed.push(id)
            return
          }
          const live = await getLiveMatchData(fixture)
          await setCachedLive(id, live)
          fetched.push(id)
        } catch (err) {
          console.log("[v0] prefetch-live failed for", id, err instanceof Error ? err.message : err)
          failed.push(id)
        }
      }),
    )

    // Son batch değilse bekle
    if (i + BATCH_SIZE < fixtureIds.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return NextResponse.json({
    total: fixtureIds.length,
    cached: cached.length,
    fetched: fetched.length,
    failed: failed.length,
    failedIds: failed,
  })
}
