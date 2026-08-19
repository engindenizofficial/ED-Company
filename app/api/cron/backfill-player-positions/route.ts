import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { playerPositionCronRun } from "@/lib/db/schema"
import { runPlayerPositionBackfillBatch } from "@/lib/player-position-sync"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"

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
// aşılamıyor. 7500+ oyuncu, oyuncu başı birkaç saniye zorunlu bekleme ile
// yüzlerce adım gerektirdiği için, zincir her zaman 5. adımda "HTTP 508 Loop
// Detected / INFINITE_LOOP_DETECTED" ile platform tarafından kesiliyordu.
//
// SONRA — bunun düzeltmesi olarak dışarıdan bir GitHub Actions cron'u eklendi
// (her 5 dakikada bir bu route'a otomatik istek atan bir workflow). Bu 508
// hatasını çözdü AMA istenmeyen bir yan etki getirdi: tarama artık admin hiç
// bir şey yapmasa da SÜREKLİ, kendiliğinden arka planda çalışmaya devam
// ediyordu (Transfermarkt'a gece gündüz istek göndererek). Admin bunu
// istemedi — sadece "Şimdi Tara" butonuna bastığında çalışmasını istiyor.
// Bu yüzden o workflow tamamen KALDIRILDI.
//
// ŞİMDİKİ ÇÖZÜM: bu route hâlâ kendini hiç tetiklemiyor (self-fetch chain
// yok, 5-sıçrama limitine hiç dokunulmuyor) — SADECE gelen TEK bir GET
// isteğine karşılık TEK bir batch işler ve döner. Ama bu isteği artık hiçbir
// zamanlayıcı/dış servis DEĞİL, admin panelindeki "Şimdi Tara" butonu
// TARAYICIDAN doğrudan gönderiyor (bkz. components/player-position-cron-
// status.tsx) — admin butona bastığı sürece tarayıcı bu route'u art arda
// çağırıp taramayı ilerletir; admin sekmeyi kapatırsa veya "Durdur"a basarsa
// hiçbir şey arka planda çalışmaya devam etmez. Yani sistem artık TAMAMEN
// admin'in kontrolünde: ne otomatik/zamanlanmış bir tetikleyici var, ne de
// admin'siz ilerleyen bir arka plan işi.
//
// Durumsuz (stateless) ilerleme: her çağrı, henüz "player_position" satırı
// olmayan en yüksek piyasa değerli oyuncuları işler (bkz.
// lib/player-position-sync.ts). Tarayıcı sekmesi kapanır/ağ kesilirse, bir
// sonraki çağrı (admin tekrar "Şimdi Tara"ya bastığında) veritabanı
// durumundan otomatik devam eder — ekstra bir "resume" endpoint'ine gerek
// yoktur.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Her çağrıda işlenecek EN FAZLA oyuncu sayısı — ama fiili sayı bundan çok
 * daha küçük olabilir, çünkü `runPlayerPositionBackfillBatch` kendi içinde
 * SOFT_TIME_BUDGET_MS (bkz. lib/player-position-sync.ts, 250s) bütçesini
 * aşınca kendi isteğiyle erken durur (tipik olarak ~250s / ~1.6s ≈ 155
 * oyuncu). Bu sayı sadece bir "tavan" — gerçek batch büyüklüğünü zaman
 * bütçesi belirler. Admin panelindeki tarayıcı döngüsü bu route'u art arda
 * çağırdığında toplam ilerleme hızı ≈ 155 oyuncu / ~250s ≈ dakikada ~37
 * oyuncu olur (ara boşluk olmadan, çünkü tarayıcı bir sonraki çağrıyı
 * öncekinin yanıtı geldiği an gönderir).
 */
const BATCH_SIZE = 500

/**
 * İki farklı çağıran türünü kabul eder:
 *
 * 1) CRON_SECRET bearer token — dışarıdan manuel bir curl/test isteği için
 *    (şu an hiçbir otomatik/zamanlanmış tetikleyici bu route'u çağırmıyor).
 * 2) Admin oturumu (çerez) — admin panelindeki "Şimdi Tara" butonu bu
 *    route'a TARAYICIDAN doğrudan (aynı origin, çerezler otomatik dahil)
 *    fetch atıyor. Bu sayede CRON_SECRET'i istemciye HİÇ göndermemize gerek
 *    kalmıyor — route, isteği gönderen kullanıcının better-auth oturumunun
 *    admin e-postasına ait olup olmadığını doğrudan kontrol ediyor (bkz.
 *    app/api/predict/route.ts'teki DELETE handler'ı — aynı desen).
 */
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get("authorization")
    if (header === `Bearer ${secret}`) return true
  }

  const session = await auth.api.getSession({ headers: await headers() })
  return isAdminEmail(session?.user?.email)
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
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
        // Heartbeat'i yeniden tazele — tarayıcının bir sonraki çağrısına
        // (veya admin'in bir sonraki "Şimdi Tara" tıklamasına) kadar "az
        // önce ilerledik" bilgisini işaretle.
        heartbeatAt: new Date(),
      })
      .where(eq(playerPositionCronRun.id, logId))

    // ÖNEMLİ — burada BİLİNÇLİ olarak bir sonraki adımı KENDİ KENDİMİZE
    // tetiklemiyoruz. `done` false ise, run satırı "running" olarak kalır ve
    // bir sonraki çağrıyı (admin'in tarayıcısındaki döngü veya elle tekrar
    // "Şimdi Tara" tıklaması) bekler. Bu, Vercel'in 5-sıçrama self-fetch
    // limitine hiç dokunmamamızı sağlıyor VE taramanın admin dışında,
    // kendiliğinden sürekli çalışmasını da önlüyor.

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
