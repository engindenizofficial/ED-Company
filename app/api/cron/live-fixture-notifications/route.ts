import { after } from "next/server"
import { scanLiveFixturesOnce } from "@/lib/live-fixture-notify"
import { triggerChainContinuation } from "@/lib/market-value-cron-run"
import { acquireChainLock, refreshChainLock, releaseChainLock } from "@/lib/redis"

// ---------------------------------------------------------------------------
// Canlı maç bildirim taraması — favori takımlardan biri sahadayken gol / maç
// başlangıcı / devre arası / 2. yarı / maç bitişi olaylarını ~30 saniyede bir
// kontrol eder.
//
// Vercel Cron'un minimum aralığı 1 dakika olduğundan, market-value cron'unda
// kullanılan AYNI "self-chaining" deseni uygulanıyor (bkz. lib/market-value-
// cron-run.ts + app/api/cron/update-market-values/route.ts): tek bir HTTP
// çağrısı, kendi içinde soft time budget (~260s) dolana kadar 30 saniyelik
// döngüyle tarama yapar, sonra `after()` ile kendini yeniden tetikler.
//
// vercel.json'daki periyodik giriş cron'u (örn. her 5 dakikada bir) bu
// route'u tetikler. O tetiklemeler arasında zincir zaten kendi kendini
// besliyor olabilir — bu yüzden bir Redis kilidi ("zaten çalışıyor" kaydı,
// market-value'daki DB tabanlı "running" satırının basit karşılığı) ile
// aynı anda birden fazla zincirin aynı maçları iki kez taramasının önüne
// geçilir.
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
/** Redis kilidinin TTL'i — her adımda tazelenir; zincir kırılırsa (crash) kilit bu süre sonra kendiliğinden düşer. */
const LOCK_TTL_SECONDS = 90
const LOCK_NAME = "live-fixture-notifications"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  await triggerChainContinuation(url.toString(), headers)
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
