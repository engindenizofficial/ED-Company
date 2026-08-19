import { after } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerPositionCronRun } from "@/lib/db/schema"
import { runPlayerPositionBackfillBatch } from "@/lib/player-position-sync"
import { fireChainStepWithoutAwaitingResponse } from "@/lib/market-value-cron-run"

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
 * SOFT_TIME_BUDGET_MS (bkz. lib/player-position-sync.ts, 190s) bütçesini
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
 * mümkün olduğunca çok oyuncuyu (tipik olarak ~190s / ~1.2s ≈ 150+ oyuncu)
 * işler, zincirin tamamlanması için gereken self-fetch sayısı ~7700'den
 * ~50'ye düşer — bu da zincirin kırılma olasılığını aynı oranda azaltır.
 * self-fetch timeout'u da (aşağıda) bu daha uzun adımın gerçek worst-case
 * süresine göre ayarlandı.
 */
const BATCH_SIZE = 500

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

// ÖNEMLİ — bu route ARTIK bir sonraki adımın TAM yanıtını beklemiyor
// (fireChainStepWithoutAwaitingResponse, bkz. lib/market-value-cron-run.ts).
//
// ESKİDEN burada triggerChainContinuation (tam yanıtı 270s'ye kadar
// bekleyen) kullanılıyordu. Ama bu route'un HER adımı SOFT_TIME_BUDGET_MS'e
// kadar (190-237s) sürüp ancak sonra yanıt döndüğü için, bu bekleme
// çağıranın KENDİ after() bloğunun — invocation'ın kendi maxDuration'ından
// (300s) geriye kalan, genelde sadece ~60-100s'lik — bütçesine sıkışıyordu.
// Bu süre bitmeden invocation sert şekilde öldürülürse, henüz tam
// gönderilmemiş self-fetch isteği de yarıda kesiliyor, bir sonraki adım hiç
// başlamıyor ve zincir sessizce kırılıyordu — admin panelinin sürekli
// "Zincir kırıldı" göstermesinin ve elle "Şimdi Tara"ya tekrar tekrar
// basılması gerekmesinin asıl kök nedeni buydu.
async function triggerNextStep(request: Request): Promise<void> {
  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  await fireChainStepWithoutAwaitingResponse(request.url, headers)
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
