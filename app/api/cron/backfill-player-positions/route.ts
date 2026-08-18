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

/**
 * Bu route için self-fetch zaman aşımı — triggerChainContinuation'ın
 * varsayılanından (15s, piyasa değeri zinciri için doğru) KASITLI olarak
 * farklı. Bir ADIMIN (SOFT_TIME_BUDGET_MS'e kadar süren, bkz. yukarıdaki
 * BATCH_SIZE yorumu) gerçek worst-case süresini bolca aşacak şekilde
 * ayarlanmalı — AKSİ HALDE self-fetch sunucu hâlâ çalışırken "zaman aşımı"
 * deyip ikinci bir paralel istek başlatır (BATCH_SIZE yorumundaki çoklanma
 * felaketi).
 *
 * Gerçek worst-case hesabı:
 *   SOFT_TIME_BUDGET_MS (190s, lib/player-position-sync.ts) bütçe kontrolü
 *   her adaydan ÖNCE yapılıyor — bu yüzden bütçeyi az aşmış olsak bile son
 *   adayın kendisi worst-case'te 4 deneme + 3 backoff sürebilir (bkz.
 *   transfermarkt-scraper.ts: FETCH_TIMEOUT_MS=8s, BLOCKING_RETRY_DELAYS_
 *   MS=[1.5s, 4s, 10s]): 8+1.5+8+4+8+10+8 = 47.5s.
 *   Toplam worst-case: 190s + 47.5s = 237.5s.
 *
 * 270s seçildi: 237.5s gerçek worst-case'in üzerine ~32.5s pay bırakıyor,
 * ve route'un kendi maxDuration'ından (300s) hâlâ belirgin şekilde altta
 * kalıyor (DB yazma/yanıt dönüşü gibi ek gecikmelere yer bırakır).
 */
const SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS = 270_000

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
