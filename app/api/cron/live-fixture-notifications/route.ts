import { isCronAuthorized } from "@/lib/cron-auth"
import { scanLiveFixturesOnce } from "@/lib/live-fixture-notify"
import { acquireChainLock, releaseChainLock } from "@/lib/redis"

// ---------------------------------------------------------------------------
// Canlı maç bildirim taraması — favori takımlardan biri sahadayken gol / maç
// başlangıcı / devre arası / 2. yarı / maç bitişi olaylarını kontrol eder.
//
// ÖNEMLİ GEÇMİŞ — bu route ÖNCEDEN kendi kendini `after()` + self-fetch ile
// tetikleyip, canlı maç varken 30s / boşta 2dk aralıklarla sonsuza kadar
// süren bir zincir oluşturmaya çalışıyordu. Bu YAPISAL olarak asla güvenilir
// çalışamazdı: Vercel platformu bir fonksiyonun kendini ZİNCİRLEME şekilde
// çağırmasına (self-fetch → o da self-fetch → ...) SABİT bir 5 sıçrama (hop)
// sınırı koyuyor. Her adım en fazla ~260s sürdüğünden, zincir 5. adımda
// (~20-22 dakika sonra) "508 Loop Detected" ile platform tarafından
// kesiliyordu — QStash'in 5 dakikalık heartbeat'i bunu ancak bir sonraki
// tetiklemesinde fark edip yeniden ayağa kaldırabiliyordu. Bu, "gol/devre
// arası bildirimi geç geliyor, sonra bir anda toplu geliyor" şikayetinin kök
// nedeniydi.
//
// ÇÖZÜM: bu route artık kendini HİÇ tetiklemiyor — SADECE gelen TEK bir GET
// isteğine karşılık TEK
// bir tarama yapar ve döner. Sürekliliği DIŞARIDAN, QStash'in kendisi
// sağlıyor (bkz. scripts/setup-qstash-schedules.mjs, scheduleId:
// "live-fixture-notifications", 1 dakikada bir — canlı maç olsun olmasın
// SABİT bu aralıkla; QStash'in cron çözünürlüğü en fazla 1 dakikadır,
// saniye bazlı ifadeler desteklenmiyor, o yüzden eski 30s hedefine tam
// ulaşılamıyor ama eski "boşta 2dk" moduna göre hâlâ daha sık ve —en
// önemlisi— GARANTİLİ). Dışarıdan gelen her istek platform için "hop 0" /
// tamamen bağımsız bir çağrı olduğundan, 5-sıçrama sınırına ASLA
// dokunulmuyor ve bir tetikleme başarısız olsa bile bir sonraki QStash
// çağrısı (1dk sonra, garantili retry ile) sorunsuz devam eder.
//
// Redis kilidi burada bir ZİNCİR kilidi DEĞİL — sadece aynı anda üst üste
// binen iki çağrının (örn. QStash'in bir retry'ı, önceki çağrı henüz
// bitmeden gelirse) aynı maçları iki kez taramasını önleyen kısa ömürlü bir
// "meşgul" işareti. TTL kasıtlı olarak QStash aralığından (1dk) kısa
// tutuluyor — normalde her çağrı saniyeler içinde bitip kilidi hemen
// serbest bırakıyor, TTL sadece invocation crash olursa kilidin sonsuza dek
// takılı kalmamasını garanti ediyor.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** "Meşgul" kilidinin TTL'i — bir çağrı bu süreden uzun sürerse (beklenmedik durum) kilit kendiliğinden düşer. */
const LOCK_TTL_SECONDS = 25
const LOCK_NAME = "live-fixture-notifications"

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Önceki çağrı hâlâ sürüyorsa (beklenmedik gecikme/çakışan retry) erken
  // çık — aynı maçların aynı anda iki kez taranıp bildirimin iki kez
  // gönderilmesini önler.
  const acquired = await acquireChainLock(LOCK_NAME, LOCK_TTL_SECONDS)
  if (!acquired) {
    return Response.json({ alreadyRunning: true })
  }

  try {
    const { liveCount, eventsSent } = await scanLiveFixturesOnce()
    return Response.json({
      totalScans: 1,
      totalEventsSent: eventsSent,
      lastLiveCount: liveCount,
      mode: liveCount > 0 ? "live" : "idle",
    })
  } catch (err) {
    console.error("[v0] Canlı maç bildirim taraması sırasında hata:", err)
    return Response.json({ error: "Canlı maç taraması başarısız oldu." }, { status: 500 })
  } finally {
    await releaseChainLock(LOCK_NAME)
  }
}
