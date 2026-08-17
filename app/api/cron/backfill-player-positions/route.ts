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
 * ÖNEMLİ — bu değer ÖNCE 200, sonra 10 idi. Her ikisi de aynı, daha ciddi
 * bir soruna yol açtı: triggerChainContinuation'ın self-fetch zaman aşımı
 * (bkz. lib/market-value-cron-run.ts SELF_FETCH_TIMEOUT_MS, 15s) bir
 * batch'in gerçek worst-case süresinden KISAdır (10 oyuncu, Transfermarkt
 * retry'ları yüzünden 90+ saniye sürebiliyordu — hatta TEK bir oyuncunun
 * worst-case'i bile ~30s'yi bulabiliyor). Bu yüzden self-fetch "zaman aşımı"
 * deyip isteği TEKRAR gönderiyordu — ama sunucudaki ilk istek iptal olmadan
 * arka planda çalışmaya devam ediyordu. Sonuç: aynı adım için birden fazla
 * paralel istek Transfermarkt'a gidip birbirini yavaşlatıyor, bu da yeni
 * zaman aşımlarına ve daha fazla paralel isteğe yol açan bir çoklanma
 * felaketi oluşturuyordu (admin "Şimdi Tara"ya bastığında "başlıyor" diyip
 * sonra hiçbir şey olmamasının, sayfa yenilenince eski duruma dönmesinin
 * asıl sebebi buydu).
 *
 * Çözüm iki parçalı: (1) piyasa değeri zincirindeki gibi her adımda TEK
 * birim iş yap (1 oyuncu — bkz. lib/market-value-cron-run.ts "her HTTP
 * çağrısı en fazla bir takım kadar iş yapar" prensibi), (2) self-fetch
 * timeout'unu bu tek oyuncunun gerçek worst-case süresine göre ayarla (bkz.
 * SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS aşağıda) — böylece sunucu hâlâ
 * çalışırken self-fetch asla "zaman aşımı" deyip ikinci bir paralel istek
 * başlatmaz.
 */
const BATCH_SIZE = 1

/**
 * Bu route için self-fetch zaman aşımı — triggerChainContinuation'ın
 * varsayılanından (15s, piyasa değeri zinciri için doğru) KASITLI olarak
 * farklı. Tek bir oyuncunun worst-case süresini (transfermarkt-scraper.ts:
 * FETCH_TIMEOUT_MS=8s + BLOCKING_RETRY_DELAYS_MS'in üç denemesi:
 * 8+1.5+8+4+8 = ~29.5s) bolca aşacak şekilde 45s seçildi — böylece sunucu
 * en kötü durumda bile hâlâ meşgulken self-fetch asla "zaman aşımı" deyip
 * yukarıdaki çoklanma felaketini tetiklemez.
 */
const SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS = 45_000

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

  await triggerChainContinuation(request.url, headers, SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS)
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
