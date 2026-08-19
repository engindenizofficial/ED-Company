import { after } from "next/server"
import { scanLiveFixturesOnce } from "@/lib/live-fixture-notify"
import { acquireChainLock, refreshChainLock, releaseChainLock } from "@/lib/redis"

// ---------------------------------------------------------------------------
// Canlı maç bildirim taraması — favori takımlardan biri sahadayken gol / maç
// başlangıcı / devre arası / 2. yarı / maç bitişi olaylarını ~30 saniyede bir
// kontrol eder.
//
// Vercel Cron'un minimum aralığı 1 dakika (Hobby planda ise günde 1 kez ile
// sınırlı) olduğundan, market-value cron'unda kullanılan AYNI "self-chaining"
// deseni uygulanıyor (bkz. lib/market-value-cron-run.ts + app/api/cron/
// update-market-values/route.ts): tek bir HTTP çağrısı, kendi içinde soft
// time budget (~260s) dolana kadar 30 saniyelik döngüyle tarama yapar, sonra
// `after()` ile kendini yeniden tetikler.
//
// Hobby planda dakikalık Vercel Cron kullanılamadığından, bu route dışarıdan
// QStash (bkz. scripts/setup-qstash-schedules.mjs, scheduleId:
// "live-fixture-notifications", 5 dakikada bir) tarafından beslenir. Eskiden
// bu görevi .github/workflows/live-fixture-notifications-cron.yml
// üstleniyordu, GitHub'ın garanti sunmayan schedule'ı yüzünden QStash'e
// taşındı. Zincir zaten çalışıyorsa (kilit tutuluyorsa) bu dıştan gelen
// tetiklemeler anında { alreadyRunning: true } döner — asıl görevleri,
// zincir herhangi bir sebeple tamamen durursa onu yeniden ateşlemek. Redis
// kilidi ("zaten çalışıyor" kaydı, market-value'daki DB tabanlı "running"
// satırının basit karşılığı) aynı anda birden fazla zincirin aynı maçları
// iki kez taramasının önüne geçer.
//
// Hiç canlı maç yoksa döngü daha uzun aralıklarla ("boşta" modu) kontrol
// eder ama zinciri SONLANDIRMAZ — yeni bir maç her an başlayabilir.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Canlı maç varken taramalar arası bekleme. */
const LIVE_POLL_INTERVAL_MS = 30_000
/** Hiç canlı maç yokken ("boşta" modu) taramalar arası bekleme — API-Football quota'sını korur. */
const IDLE_POLL_INTERVAL_MS = 2 * 60_000
/** Her HTTP çağrısının en fazla bu kadar süre döngüde kalıp sonra kendini yeniden tetiklemesi — bkz. update-market-values/route.ts'deki STEP_BUDGET_MS açıklaması. */
const STEP_BUDGET_MS = 260_000
/**
 * Redis kilidinin TTL'i — her adımda tazelenir; zincir kırılırsa (crash) kilit
 * bu süre sonra kendiliğinden düşer.
 *
 * ÖNEMLİ — bu değer IDLE_POLL_INTERVAL_MS'DEN (120s) KESİNLİKLE BÜYÜK olmalı.
 * Kilit her taramadan SONRA, bir sonraki taramadan ÖNCEKİ uykudan ÖNCE
 * tazeleniyor: tazele → uyu. Eskiden TTL 90s idi ama boşta modda 120s
 * uyunuyordu — yani kilit, döngü hâlâ sağlıklı çalışırken (uykudayken)
 * kendiliğinden düşüyordu. Bu pencerede GitHub Actions'ın 5 dakikalık
 * heartbeat tetiklemesi denk gelirse, hâlâ çalışan zincirin üzerine BAĞIMSIZ
 * bir ikinci zincir daha başlıyordu — tam olarak maçın başladığı/idle'dan
 * live'a geçtiği an, iki paralel zincir aynı durum geçişini (örn. devre
 * arası) ayrı ayrı tespit edip HER İKİSİ DE push gönderiyordu ("aynı
 * bildirim arka arkaya 3-4 kez" şikayetinin kök nedeni). Kilit süresi her
 * zaman en uzun bekleme aralığını rahatça kapsamalı.
 */
const LOCK_TTL_SECONDS = 180
const LOCK_NAME = "live-fixture-notifications"

/**
 * Bir sonraki zincir adımını tetikleyen self-fetch'in, TAM YANITI beklemeden
 * "istek gönderildi mi, hızlı bir hata (401/5xx) döndü mü" diye kontrol
 * etmek için beklediği süre.
 *
 * ÖNEMLİ — bu route'un market-value-cron zincirinden (bkz.
 * market-value-cron-run.ts'deki triggerChainContinuation) TEMEL bir farkı
 * var: market-value'da her adım HIZLIDIR (bir lig hazırlığı veya bir takım),
 * o yüzden tam yanıtı beklemek güvenlidir. Burada ise her adım STEP_BUDGET_MS'e
 * kadar (260s) döngüde kalıp ANCAK SONRA yanıt döner.
 *
 * `after()` bloğu, ana handler zaten ~260s tükettiği için Vercel'in
 * maxDuration'ından (300s) geriye kalan SADECE ~40 saniyelik bütçeyle
 * çalışıyor. Bir sonraki adımın (kendisi de 260s'ye kadar sürebilecek) TAM
 * yanıtını `await` etmeye çalışsaydık, invocation bu yanıtı hiç görmeden
 * Vercel tarafından sert şekilde öldürülürdü — bu da zincirin devamının
 * SADECE "aşağıdaki invocation'ın kendi after()'ını tetikleyip tetiklemediğine"
 * bağlı, garantisiz bir şansa kalmasına yol açıyordu. Eğer bu istek bir
 * sebeple (401 — örn. Vercel Deployment Protection, veya ağ hatası) hemen
 * başarısız olursa, zincir kimse fark etmeden tamamen ölüyordu ve tek
 * güvenlik ağı GitHub Actions'ın 5 dakikalık (ve platformun kendi
 * belgelerine göre yoğun saatlerde onlarca dakika gecikebilen) heartbeat'i
 * oluyordu — "gol/devre arası bildirimi 20-40 dakika sonra geliyor"
 * şikayetinin en olası kök nedeni tam olarak bu.
 *
 * Çözüm: TAM yanıtı beklemeyip sadece isteğin kabul edildiğini (ya da hızlı
 * bir hata döndürdüğünü) doğrulayacak kadar kısa süre bekleriz, ardından
 * — isteği İPTAL ETMEDEN — kendi invocation'ımızı bitiririz. Downstream
 * invocation, HTTP isteği ağa gönderildiği anda bizim beklememizden
 * bağımsız olarak çalışmaya başlar.
 */
const CHAIN_FIRE_CONFIRM_TIMEOUT_MS = 8_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Bir sonraki zincir adımını "ateşler" — tam yanıtını beklemeden. Yalnızca
 * isteğin hemen (auth kontrolü gibi) başarısız olup olmadığını görmek için
 * kısa bir pencere bekler; bu pencerede yanıt gelmezse (beklenen durum —
 * downstream kendi 260s'lik taramasına başlamıştır) sessizce devam eder.
 *
 * KASITLI OLARAK AbortController KULLANILMAZ: bir zaman aşımı için isteği
 * iptal etmek, bazı platformlarda alt taraftaki invocation'ı da (henüz tek
 * bir tarama bile yapmadan) durdurabilir. Biz sadece kendi beklememizi
 * durduruyoruz, ağa gönderilmiş olan isteği değil.
 */
async function fireNextChainStep(url: string, headers: Record<string, string>): Promise<void> {
  try {
    const outcome = await Promise.race([
      fetch(url, { headers }).then((res) => ({ settled: true as const, res })),
      sleep(CHAIN_FIRE_CONFIRM_TIMEOUT_MS).then(() => ({ settled: false as const, res: null })),
    ])

    if (!outcome.settled) {
      // Beklenen durum: downstream adım kendi tarama döngüsüne başladı,
      // yanıtı bu pencerede dönmedi. İstek zaten ağa gönderildi, bekleyip
      // kendi invocation'ımızın bütçesini tüketmeye gerek yok.
      return
    }

    if (!outcome.res.ok) {
      const body = await outcome.res.text().catch(() => "")
      console.error(
        `[v0] Canlı maç zincir tetiklemesi hızlı bir hata döndürdü (HTTP ${outcome.res.status}) — zincir muhtemelen burada durdu, GitHub Actions heartbeat'i devreye girecek: ${body.slice(0, 300)}`,
      )
    }
  } catch (err) {
    console.error("[v0] Canlı maç zincir tetiklemesi ağ hatasıyla başarısız oldu:", err)
  }
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function triggerNextChainStep(request: Request): Promise<void> {
  const url = new URL(request.url)
  url.searchParams.set("continuation", "1")

  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  await fireNextChainStep(url.toString(), headers)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const isContinuation = searchParams.get("continuation") === "1"

  if (!isContinuation) {
    // Dıştan gelen tetikleme (vercel.json'daki periyodik giriş cron'u). Zincir
    // zaten çalışıyorsa (kilit tutuluyorsa) ikinci bir tanesini başlatmadan
    // erken çık — aynı maçların iki kez taranmasını önler.
    const acquired = await acquireChainLock(LOCK_NAME, LOCK_TTL_SECONDS)
    if (!acquired) {
      return Response.json({ alreadyRunning: true })
    }
  }

  const startedAt = Date.now()
  let totalScans = 0
  let totalEventsSent = 0
  let lastLiveCount = 0

  try {
    // Zaman bütçesi dolana kadar arka arkaya tara — bu, gereken self-fetch
    // sayısını (ve dolayısıyla kırılma riskini) azaltır (bkz. STEP_BUDGET_MS).
    while (Date.now() - startedAt < STEP_BUDGET_MS) {
      const { liveCount, eventsSent } = await scanLiveFixturesOnce()
      totalScans++
      totalEventsSent += eventsSent
      lastLiveCount = liveCount

      // Kilidi tazele — zincir hâlâ sağlıklı ilerliyor.
      await refreshChainLock(LOCK_NAME, LOCK_TTL_SECONDS)

      const interval = liveCount > 0 ? LIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS
      const remaining = STEP_BUDGET_MS - (Date.now() - startedAt)
      if (remaining <= interval) break
      await sleep(interval)
    }
  } catch (err) {
    console.error("[v0] Canlı maç bildirim taraması sırasında hata:", err)
  }

  // Yanıtı bekletmeden zincirin bir sonraki adımını tetikle — hiç canlı maç
  // olmasa da zincir sonlanmaz, sadece "boşta" aralığında devam eder.
  after(() => triggerNextChainStep(request))

  return Response.json({
    totalScans,
    totalEventsSent,
    lastLiveCount,
    mode: lastLiveCount > 0 ? "live" : "idle",
  })
}
