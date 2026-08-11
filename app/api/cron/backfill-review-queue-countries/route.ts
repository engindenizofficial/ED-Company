import { after } from "next/server"
import { db } from "@/lib/db"
import { marketValueReviewQueue } from "@/lib/db/schema"
import { and, eq, isNull, or } from "drizzle-orm"
import { getTeamCountry, getPlayerNationality } from "@/lib/api-football"
import { scrapeTeamCountry, scrapePlayerNationality } from "@/lib/transfermarkt-scraper"

// ---------------------------------------------------------------------------
// TEK SEFERLİK backfill endpoint'i. Review kuyruğunda ülke bilgisi eklenmeden
// önce oluşmuş, halen "pending" olan eski kayıtları geriye dönük doldurur.
// Yeni kayıtlar için bu bilgi artık lib/market-value-sync.ts içinde otomatik
// ekleniyor — bu route sadece o özellik eklenmeden önceki kayıtlar için var.
//
// update-market-values cron'undaki gibi kendi kendini zincirler: her çağrı
// sadece bir grup (BATCH_SIZE) satır işler, sonra bir sonraki grubu after()
// ile tetikleyip hemen yanıt döner (serverless zaman aşımını önlemek için).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

const BATCH_SIZE = 15

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true
  // vercel curl gibi custom header gönderemeyen araçlar için query param desteği.
  const url = new URL(request.url)
  return url.searchParams.get("secret") === secret
}

async function triggerNextBatch(request: Request): Promise<void> {
  const url = new URL(request.url)
  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  try {
    await fetch(url.toString(), { headers })
  } catch (err) {
    console.error("[v0] Bir sonraki backfill grubu tetiklenemedi:", err)
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const season = currentSeason()

  const rows = await db
    .select()
    .from(marketValueReviewQueue)
    .where(
      and(
        eq(marketValueReviewQueue.status, "pending"),
        or(isNull(marketValueReviewQueue.entityCountry), isNull(marketValueReviewQueue.candidateCountry)),
      ),
    )
    .limit(BATCH_SIZE)

  if (rows.length === 0) {
    return Response.json({ done: true, message: "Tüm bekleyen kayıtlar dolduruldu." })
  }

  let updated = 0
  let failed = 0

  for (const row of rows) {
    try {
      const [entityCountry, candidateCountry] = await Promise.all([
        row.entityType === "team" ? getTeamCountry(row.entityId) : getPlayerNationality(row.entityId, season),
        row.candidateTransfermarktId
          ? row.entityType === "team"
            ? scrapeTeamCountry(row.candidateTransfermarktId)
            : scrapePlayerNationality(row.candidateTransfermarktId)
          : Promise.resolve(null),
      ])

      await db
        .update(marketValueReviewQueue)
        .set({ entityCountry, candidateCountry })
        .where(eq(marketValueReviewQueue.id, row.id))

      updated++
    } catch (err) {
      failed++
      console.error(`[v0] Backfill hatası (${row.id}):`, err instanceof Error ? err.message : err)
    }

    // Transfermarkt'a art arda çok hızlı istek atmamak için bekleme.
    await sleep(500)
  }

  // Yanıtı bekletmeden bir sonraki grubu tetikle.
  after(() => triggerNextBatch(request))

  return Response.json({ done: false, batchUpdated: updated, batchFailed: failed })
}
