import { after } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerPositionCronRun } from "@/lib/db/schema"
import { runPlayerPositionBackfillBatch } from "@/lib/player-position-sync"
import { triggerChainContinuation } from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// 7.526 oyuncunun Transfermarkt mevki verisini kademeli, arka planda dolduran
// route. vercel.json'da otomatik bir cron ZAMANLAMASI YOK — bilinçli olarak
// tek bir tetikleme ile (admin panelinden veya bu route'a bir GET isteğiyle)
// başlatılır ve kendi kendini `after()` ile tetikleyerek (bkz.
// app/api/cron/resume-market-values) tüm adaylar bitene kadar arka planda
// devam eder.
//
// Durumsuz (stateless) ilerleme: her adım, henüz "player_position" satırı
// olmayan en yüksek piyasa değerli oyuncuları işler (bkz.
// lib/player-position-sync.ts). Zincir bir yerde kesilirse (deploy,
// serverless zaman aşımı, ağ hatası), bu route'a tekrar bir GET isteği
// atmak yeterlidir — kaldığı yerden (veritabanı durumundan) otomatik devam
// eder, ayrı bir "resume" endpoint'ine gerek yoktur.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Her adımda işlenecek oyuncu sayısı.
 *
 * ÖNEMLİ — bu değer ÖNCEDEN 200'dü. 200 oyuncu, oyuncu başına ortalama
 * 1-3s (bazen retry ile ~10-13s) sürdüğü için TEK bir adımın bitmesi
 * 3-5+ dakika sürebiliyordu — ve admin paneldeki "player_position_cron_run"
 * satırı (playersProcessed/playersMatched) SADECE adım tamamen bitince
 * güncellendiği için, admin "Şimdi Tara"ya bastıktan sonra 3-5 dakika boyunca
 * hiçbir sayı değişmeden "0 işlendi" görüyordu — arka planda gerçekten
 * çalışıyor olsa bile tamamen donmuş/başlamamış gibi görünüyordu.
 *
 * Piyasa değeri döngüsü (bkz. lib/market-value-cron-run.ts) AYNI sorunu
 * "her adımda TEK takım işle" diyerek çözüyor — burada da aynı prensiple
 * grubu küçültüyoruz: her adım artık sadece 10 oyuncu işler (~10-20s),
 * admin panelindeki 4 saniyelik polling ile GERÇEKTEN görünür, sık
 * güncellenen ilerleme sağlar. Toplam süre değişmez (aynı sayıda oyuncu,
 * sadece daha küçük ve daha çok self-fetch adımına bölünmüş şekilde).
 */
const BATCH_SIZE = 10

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

// ÖNEMLİ — bu self-fetch, piyasa değeri zincirindeki AYNI dayanıklı
// triggerChainContinuation'ı (bkz. lib/market-value-cron-run.ts) kullanır:
// zaman aşımı + 3 deneme ile yeniden dener, başarısız HTTP kodlarını da hata
// sayar. Eskiden burada tek seferlik, yeniden denemesiz bir fetch vardı —
// geçici bir ağ hatası veya Vercel'in isteği bir an bloklaması zinciri
// sessizce ve kalıcı olarak durduruyordu (site kapalıyken/kısa kesintilerde
// piyasa değeri zinciri devam ederken mevki zincirinin durmasının sebebi
// buydu).
async function triggerNextStep(request: Request): Promise<void> {
  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  await triggerChainContinuation(request.url, headers)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const runStartedAt = new Date()
  const logId = `player-position-run-${runStartedAt.getTime()}`
  await db.insert(playerPositionCronRun).values({ id: logId, runStartedAt, status: "running" })

  try {
    const result = await runPlayerPositionBackfillBatch(BATCH_SIZE)
    const done = result.processed === 0 || result.remaining === 0

    await db
      .update(playerPositionCronRun)
      .set({
        status: done ? "completed" : "running",
        runFinishedAt: done ? new Date() : undefined,
        playersProcessed: result.processed,
        playersMatched: result.matched,
      })
      .where(eq(playerPositionCronRun.id, logId))

    if (!done) {
      // Bir sonraki adımı arka planda tetikle — bu isteğin cevabı kullanıcıya
      // hemen döner, backfill kesintisiz devam eder.
      after(() => triggerNextStep(request))
    }

    return Response.json({ done, ...result })
  } catch (err) {
    console.error("[v0] Mevki backfill hatası:", err)
    await db
      .update(playerPositionCronRun)
      .set({
        status: "failed",
        runFinishedAt: new Date(),
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(playerPositionCronRun.id, logId))

    return Response.json({ error: "Mevki backfill başarısız oldu." }, { status: 500 })
  }
}
