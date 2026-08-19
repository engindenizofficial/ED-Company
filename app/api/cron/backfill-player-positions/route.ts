import { after } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerPositionCronRun } from "@/lib/db/schema"
import { runPlayerPositionBackfillBatch } from "@/lib/player-position-sync"
import { triggerChainContinuation } from "@/lib/market-value-cron-run"

/**
 * Bir sonraki adımın TAM yanıtını bekleyecek zaman aşımı — bu adımın
 * worst-case süresinden (bkz. lib/player-position-sync.ts SOFT_TIME_BUDGET_MS
 * = 70s + son adayın tam 3 tekrar denemesi ~45s ≈ 115s) belirgin şekilde
 * fazla olmalı, aksi halde triggerChainContinuation kendi zaman aşımına
 * uğrayıp isteği tekrar gönderir ve ilk istek arka planda hâlâ çalışırken
 * paralel bir çoklanmaya yol açabilir (bkz. o fonksiyonun kendi açıklaması).
 */
const NEXT_STEP_TIMEOUT_MS = 150_000

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
 * Her adımda işlenecek EN FAZLA oyuncu sayısı — ama fiili sayı bundan çok
 * daha küçük olabilir, çünkü `runPlayerPositionBackfillBatch` kendi içinde
 * SOFT_TIME_BUDGET_MS (bkz. lib/player-position-sync.ts, artık 70s) bütçesini
 * aşınca kendi isteğiyle erken durur. Yani bu sayı sadece bir "tavan" —
 * gerçek batch büyüklüğünü zaman bütçesi belirler.
 *
 * ÖNEMLİ GEÇMİŞ — bu değer sırasıyla 200, 10, sonra 1 oldu. 200 ve 10 aynı
 * ciddi soruna yol açtı: o zamanki self-fetch zaman aşımı (15s) bir
 * batch'in gerçek worst-case süresinden (Transfermarkt retry'ları yüzünden
 * 90+ saniye) KISAydı — self-fetch "zaman aşımı" deyip isteği TEKRAR
 * gönderiyordu, ama sunucudaki ilk istek iptal olmadan arka planda çalışmaya
 * devam ediyordu → aynı adım için paralel istekler Transfermarkt'a gidip
 * birbirini yavaşlatan bir çoklanma felaketi oluşuyordu. Buna karşı BATCH_
 * SIZE=1'e düşürüldü — ama bu da 7700+ oyuncu için ZİNCİRİN 7700+ kez ard
 * arda, HİÇ KIRILMADAN self-fetch etmesini gerektiriyordu; tek bir geçici
 * ağ/deployment-protection hatası (self-fetch'in 3 denemesinin hepsi
 * başarısız olursa, bkz. triggerChainContinuation) zinciri kalıcı olarak
 * durduruyordu — admin panelinin sürekli "Zincir kırıldı" göstermesinin ve
 * elle "Şimdi Tara"ya tekrar tekrar basılması gerekmesinin asıl sebebi
 * buydu.
 *
 * Çözüm: batch boyutunu tavan olarak büyük tut (500) ama gerçek işi
 * SOFT_TIME_BUDGET_MS'e bırak — böylece her adım güvenli bir şekilde
 * mümkün olduğunca çok oyuncuyu (tipik olarak ~70s / ~3.4s ≈ 20 oyuncu)
 * işler. Bu, ~50 self-fetch'lik önceki (190s bütçeli) sürüme göre daha
 * FAZLA self-fetch (~380) gerektirir, ama artık her biri triggerChain-
 * Continuation'ın dayanıklı (tam yanıt bekleyen, 3 kez deneyen) deseniyle
 * yapılıyor — tek bir adımın "ateşleme anında iz bırakmadan kesilmesi"
 * riski ortadan kalktığı için daha fazla adım gerekmesi artık bir dezavantaj
 * değil, kırılmaya karşı bilinçli bir ödünleşim.
 */
const BATCH_SIZE = 500

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

// ÖNEMLİ — bu route ARTIK market-value zinciriyle AYNI dayanıklı deseni
// (triggerChainContinuation — bir sonraki adımın TAM yanıtını bekleyen,
// başarısız/zaman aşımına uğrayan denemeleri 3 kez tekrar eden) kullanıyor.
//
// ESKİDEN burada fireChainStepWithoutAwaitingResponse (tam yanıtı
// beklemeyen, sadece isteği "ateşleyip" hemen dönen) kullanılıyordu — çünkü
// o zamanki SOFT_TIME_BUDGET_MS (190s) her adımı invocation'ın 300s'lik
// payının BÜYÜK KISMINI tüketecek kadar uzatıyordu, after() bloğuna sadece
// ~60-100s kalıyordu. İstek ağa TAM çıkmadan invocation sert şekilde
// öldürülürse, bir sonraki adım hiç başlamıyor ve zincir hiçbir hata izi
// bırakmadan kırılıyordu — admin panelinin sürekli "Zincir kırıldı"
// göstermesinin ve elle "Şimdi Tara"ya tekrar tekrar basılması gerekmesinin
// asıl kök nedeni buydu.
//
// SOFT_TIME_BUDGET_MS artık 70s'e düşürüldüğü için (bkz. lib/player-
// position-sync.ts) her adımın worst-case süresi ~115s'ye iniyor — after()
// bloğuna ~185s'lik bol bir pay kalıyor. Bu pay, triggerChainContinuation'ın
// tam yanıtı NEXT_STEP_TIMEOUT_MS'e (150s) kadar güvenle beklemesine, 401/5xx
// gibi hataları yeniden denemesine yetiyor — istek artık asla "ateşleme
// anında" iz bırakmadan kesilmiyor.
async function triggerNextStep(request: Request): Promise<void> {
  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  await triggerChainContinuation(request.url, headers, NEXT_STEP_TIMEOUT_MS)
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
    // ÖNEMLİ — bu satırı bir batch için "ele aldığımızı" HEMEN (gerçek işe
    // başlamadan önce) heartbeat'i tazeleyerek işaretliyoruz. Bunun nedeni:
    // runPlayerPositionBackfillBatch tek bir adımda 190-237s sürebiliyor —
    // eğer heartbeat SADECE batch bittiğinde güncellenirse, bu uzun pencere
    // boyunca (batch hâlâ çalışırken) heartbeat eski görünür ve admin
    // panelinden veya bir "resume" cron'undan gelen paralel bir tetikleme
    // "stale, tekrar başlat" diyerek AYNI anda ikinci bir batch'i tetikleyip
    // Transfermarkt'a çift istek göndertebilir (bkz. schema.ts heartbeatAt
    // açıklaması) — asıl kırılmaya yol açan çoklanma budur.
    await db.update(playerPositionCronRun).set({ heartbeatAt: new Date() }).where(eq(playerPositionCronRun.id, logId))
  } else {
    const runStartedAt = new Date()
    logId = `player-position-run-${runStartedAt.getTime()}`
    await db.insert(playerPositionCronRun).values({ id: logId, runStartedAt, status: "running", heartbeatAt: runStartedAt })
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
        // Batch başarıyla bitti — heartbeat'i yeniden tazele (bir sonraki
        // adım tetiklenmeden önce zincirin "az önce ilerlediğini" işaretle).
        heartbeatAt: new Date(),
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
        heartbeatAt: new Date(),
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(playerPositionCronRun.id, logId))

    return Response.json({ error: "Mevki backfill başarısız oldu." }, { status: 500 })
  }
}
