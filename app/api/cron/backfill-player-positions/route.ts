import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { playerPositionCronRun } from "@/lib/db/schema"
import { runPlayerPositionBackfillBatch } from "@/lib/player-position-sync"

// ---------------------------------------------------------------------------
// 7.500+ oyuncunun Transfermarkt mevki verisini kademeli, arka planda dolduran
// route.
//
// ÖNEMLİ GEÇMİŞ — bu route ÖNCEDEN kendi kendini `after()` + self-fetch ile
// tetikleyerek (bir adım bitince aynı URL'e kendi sunucusundan tekrar istek
// göndererek) zinciri tek bir "Şimdi Tara" tıklamasıyla uçtan uca bitirmeye
// çalışıyordu. Bu YAPISAL olarak asla düzgün çalışamazdı: Vercel platformu,
// bir fonksiyonun kendini ZİNCİRLEME şekilde çağırmasına (self-fetch → o da
// self-fetch → ...) SABİT bir 5 sıçrama (hop) sınırı koyuyor — maliyet/kötüye
// kullanım koruması olarak, ve bu hiçbir kod/timeout/header değişikliğiyle
// aşılamıyor. 7500+ oyuncu, oyuncu başı 3s zorunlu bekleme ile yüzlerce adım
// gerektirdiği için, zincir her zaman 5. adımda "HTTP 508 Loop Detected /
// INFINITE_LOOP_DETECTED" ile platform tarafından kesiliyordu — kaç kez adım
// süresi/timeout ayarı değiştirilirse değiştirilsin bu limit hep aynı yerde
// duruyordu. (Piyasa değeri zinciri hiç kırılmıyordu çünkü onun TOPLAM işi
// 5 adıma hiç ulaşmadan bitiyor.)
//
// ÇÖZÜM: bu route artık kendini HİÇ tetiklemiyor — SADECE gelen TEK bir GET
// isteğine karşılık TEK bir batch işler ve döner. Zincirin "devamını" DIŞARIDAN
// (Vercel'in kendi fonksiyon-çağırma ağının dışından) gelen periyodik bir
// zamanlayıcı (örn. cron-job.org, her 1 dakikada bir) sağlıyor. Dışarıdan
// gelen her istek platform için "hop 0" / tamamen bağımsız bir çağrı olduğu
// için, kaç yüz/bin kez çağrılırsa çağrılsın 5-sıçrama sınırına ASLA
// dokunulmuyor.
//
// Durumsuz (stateless) ilerleme: her çağrı, henüz "player_position" satırı
// olmayan en yüksek piyasa değerli oyuncuları işler (bkz.
// lib/player-position-sync.ts). Zamanlayıcı bir çağrıyı atlarsa ya da bir
// çağrı ortada kesilirse, bir sonraki çağrı veritabanı durumundan otomatik
// devam eder — ekstra bir "resume" endpoint'ine gerek yoktur.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Her çağrıda işlenecek EN FAZLA oyuncu sayısı — ama fiili sayı bundan çok
 * daha küçük olabilir, çünkü `runPlayerPositionBackfillBatch` kendi içinde
 * SOFT_TIME_BUDGET_MS (bkz. lib/player-position-sync.ts, 70s) bütçesini
 * aşınca kendi isteğiyle erken durur (tipik olarak ~70s / ~3.4s ≈ 20 oyuncu).
 * Bu sayı sadece bir "tavan" — gerçek batch büyüklüğünü zaman bütçesi
 * belirler. Dış zamanlayıcı bu route'u kaç dakikada bir çağırırsa, toplam
 * ilerleme hızı da o kadar olur (örn. 1 dakikada bir çağrı × ~20 oyuncu/çağrı
 * ≈ dakikada ~20 oyuncu).
 */
const BATCH_SIZE = 500

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ÖNEMLİ — devam eden ("running") bir koşu varsa onu SATIR olarak yeniden
  // kullanıyoruz — yeni satır açmak yerine aynı satırın sayaçlarını
  // (playersProcessed/playersMatched) her çağrıda ARTIRARAK güncelliyoruz.
  // Böylece tüm koşu boyunca (ilk çağrıdan "completed"e kadar) TEK bir satır
  // var olur — market-value cron sistemindeki "tek satır, yerinde güncelle"
  // deseninin aynısı (bkz. lib/market-value-cron-run.ts).
  const [activeRun] = await db
    .select({ id: playerPositionCronRun.id })
    .from(playerPositionCronRun)
    .where(eq(playerPositionCronRun.status, "running"))
    .orderBy(desc(playerPositionCronRun.createdAt))
    .limit(1)

  let logId: string
  if (activeRun) {
    logId = activeRun.id
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
        // Bu çağrının sayısını, önceki çağrılardan gelen toplama EKLE —
        // üzerine yazma. Aksi halde satır her zaman SADECE son çağrının
        // sayısını gösterirdi, koşunun tamamının toplamını değil.
        playersProcessed: sql`${playerPositionCronRun.playersProcessed} + ${result.processed}`,
        playersMatched: sql`${playerPositionCronRun.playersMatched} + ${result.matched}`,
        // Heartbeat'i yeniden tazele — dış zamanlayıcının bir sonraki
        // çağrısına kadar "az önce ilerledik" bilgisini işaretle.
        heartbeatAt: new Date(),
      })
      .where(eq(playerPositionCronRun.id, logId))

    // ÖNEMLİ — burada BİLİNÇLİ olarak bir sonraki adımı KENDİ KENDİMİZE
    // tetiklemiyoruz. `done` false ise, run satırı "running" olarak kalır ve
    // dış zamanlayıcının bir sonraki periyodik çağrısı bu route'u tekrar
    // çağırarak devam ettirir. Bu, Vercel'in 5-sıçrama self-fetch limitine
    // hiç dokunmamamızı sağlıyor.

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
