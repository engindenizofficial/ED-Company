import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerPowerCronRun } from "@/lib/db/schema"
import { runPlayerPowerSync } from "@/lib/player-power-sync"

// ---------------------------------------------------------------------------
// Vercel Cron her gün 03:00 (İstanbul saati) bu endpoint'i tetikler (bkz.
// vercel.json — "0 0 * * *" = her gün 00:00 UTC = 03:00 TR).
//
// Piyasa değeri cron'unun (haftalık, 24 lig zincirleme) aksine bu iş yükü
// küçüktür: sadece son 1-3 gündeki biten maçların oyuncu istatistiklerini
// çeker (bkz. lib/player-power-sync.ts), zincirleme/devam ettirme mantığına
// gerek yoktur — tek bir çağrı içinde tamamlanır.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const runStartedAt = new Date()
  const logId = `player-power-run-${runStartedAt.getTime()}`
  await db.insert(playerPowerCronRun).values({ id: logId, runStartedAt, status: "running" })

  try {
    const result = await runPlayerPowerSync()
    await db
      .update(playerPowerCronRun)
      .set({
        status: "completed",
        runFinishedAt: new Date(),
        fixturesScanned: result.fixturesScanned,
        fixturesProcessed: result.fixturesProcessed,
        playersUpdated: result.playersUpdated,
      })
      .where(eq(playerPowerCronRun.id, logId))

    return Response.json({ done: true, ...result })
  } catch (err) {
    console.error("[v0] Oyuncu güç motoru cron hatası:", err)
    await db
      .update(playerPowerCronRun)
      .set({
        status: "failed",
        runFinishedAt: new Date(),
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(playerPowerCronRun.id, logId))

    return Response.json({ error: "Güç motoru senkronu başarısız oldu." }, { status: 500 })
  }
}
