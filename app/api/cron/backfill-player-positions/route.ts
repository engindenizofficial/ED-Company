import { after } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
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
 * farklı. Tek bir oyuncunun worst-case süresini bolca aşacak şekilde
 * ayarlanmalı.
 *
 * Gerçek worst-case hesabı (transfermarkt-scraper.ts: FETCH_TIMEOUT_MS=8s,
 * BLOCKING_RETRY_DELAYS_MS=[1.5s, 4s, 10s], retries=3 → toplam 4 deneme,
 * aralarında 3 bekleme):
 *   deneme1(8s) + bekle(1.5s) + deneme2(8s) + bekle(4s) + deneme3(8s)
 *   + bekle(10s) + deneme4(8s) = 8+1.5+8+4+8+10+8 = 47.5s
 *
 * ÖNEMLİ — burada ÖNCEDEN 45s idi ve yorumdaki hesap eksikti (son deneme +
 * son beklemeyi saymamıştı, gerçek değeri ~2.5s eksik gösteriyordu). 45s <
 * 47.5s gerçek worst-case olduğu için, TAM da o en nadir "4 deneme de zaman
 * aşımına uğradı" senaryosunda self-fetch sunucu HÂLÂ meşgulken "zaman
 * aşımı" deyip ikinci bir paralel isteği tetikleyebilir, bu da tekrar
 * BATCH_SIZE=200/10 sırasında yaşanan çoklanma felaketini (bkz. yukarıdaki
 * BATCH_SIZE yorumu) küçük ölçekte tetikleyebilirdi. Şimdi 60s'ye
 * çıkarıldı — gerçek 47.5s worst-case'in üzerine ~12.5s'lik bolca pay
 * bırakıyor.
 */
const SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS = 60_000

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

  // ÖNEMLİ — BATCH_SIZE=1 (bkz. yukarıdaki yorum) her GET'in TEK bir oyuncu
  // işlemesi anlamına geliyor, ve zincir kendini yüzlerce/binlerce kez
  // tetikleyerek devam ediyor. Öncesinde her GET burada YENİ bir satır
  // insert ediyordu ("logId" her zaman `Date.now()`'a göre benzersizdi) —
  // sadece EN SON satır "completed" olarak işaretleniyor, zincirdeki tüm ara
  // adımların satırları SONSUZA KADAR "running" (0/0 sayaçlarla) kalıyordu.
  // Bu, admin panelinin gösterdiği bilgiyi bozmuyordu (panel her zaman en
  // son satırı okur), ama binlerce oyuncu tam bir taramadan geçtiğinde
  // tabloya binlerce "yarım" satır birikiyordu.
  //
  // Düzeltme: devam eden ("running") bir koşu varsa onu SATIR olarak
  // yeniden kullanıyoruz — yeni satır açmak yerine aynı satırın sayaçlarını
  // (playersProcessed/playersMatched) her adımda ARTIRARAK güncelliyoruz.
  // Böylece tüm zincir boyunca (ilk tetiklemeden "completed"e kadar) TEK bir
  // satır var olur — market-value cron sistemindeki "tek satır, yerinde
  // güncelle" deseninin aynısı (bkz. lib/market-value-cron-run.ts).
  const [activeRun] = await db
    .select({ id: playerPositionCronRun.id })
    .from(playerPositionCronRun)
    .where(eq(playerPositionCronRun.status, "running"))
    .orderBy(desc(playerPositionCronRun.createdAt))
    .limit(1)

  let logId: string
  if (activeRun) {
    logId = activeRun.id
  } else {
    const runStartedAt = new Date()
    logId = `player-position-run-${runStartedAt.getTime()}`
    await db.insert(playerPositionCronRun).values({ id: logId, runStartedAt, status: "running" })
  }

  try {
    const result = await runPlayerPositionBackfillBatch(BATCH_SIZE)
    const done = result.processed === 0 || result.remaining === 0

    await db
      .update(playerPositionCronRun)
      .set({
        status: done ? "completed" : "running",
        runFinishedAt: done ? new Date() : undefined,
        // Bu adımın sayısını, önceki adımlardan gelen toplama EKLE — üzerine
        // yazma. Aksi halde satır her zaman SADECE son adımın (1 oyuncu)
        // sayısını gösterirdi, koşunun tamamının toplamını değil.
        playersProcessed: sql`${playerPositionCronRun.playersProcessed} + ${result.processed}`,
        playersMatched: sql`${playerPositionCronRun.playersMatched} + ${result.matched}`,
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
