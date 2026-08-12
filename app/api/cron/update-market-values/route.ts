import { after } from "next/server"
import { cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import {
  startNewCronRun,
  getActiveCronRun,
  processCronRunStep,
  completeCronRun,
  isCronRunStale,
  triggerChainContinuation,
  type CronRunRow,
} from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// Vercel Cron her Çarşamba 03:00 (İstanbul saati) bu endpoint'i tetikler
// (bkz. vercel.json — "0 0 * * 3" = Çarşamba 00:00 UTC = Çarşamba 03:00 TR).
//
// 23 lig tek bir istekte işlenmiyor (Transfermarkt + API-Football'a yüzlerce
// istek gidiyor, serverless zaman aşımı riski var). Bunun yerine bu route
// kendi kendini zincirler: her çağrı SADECE bir ligi işler, sonra bir sonraki
// ligi tetikleyip (after() ile, cevabı bekletmeden) hemen yanıt döner.
//
// ÖNEMLİ — durum artık URL parametrelerinde değil, DB'de (market_value_cron_run)
// kalıcı tutulur (bkz. lib/market-value-cron-run.ts). Her adımda (her lig
// işlendiğinde) o satır güncellenir: hangi ligde kalındığı, kaç kez denendiği,
// son hatası. Zincir bir yerde kesilirse (crash, zaman aşımı, ağ hatası) bu
// satır tam olarak nerede kalındığını gösterir. Devam ettirme otomatik
// gerçekleşmez — admin panelindeki "Devam Ettir" butonu (bkz. app/api/cron/
// resume-market-values) manuel olarak tetiklenmelidir.
//
// Ayrıca her lig, geçici hatalara (rate limit, 503, ağ) karşı tek istek
// içinde birkaç kez yeniden denenir (bkz. runSingleLeagueWithRetries).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  // Üretime alınmadan önce CRON_SECRET eklenmesi önerilir.
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function triggerNextStep(request: Request, runId: string): Promise<void> {
  const url = new URL(request.url)
  // "runId" parametresi bu çağrının zincirin İÇİNDEN geldiğini işaretler —
  // bu sayede aşağıdaki GET handler'ı, az önce kendisinin tazelediği
  // heartbeat'e bakıp yanlışlıkla "zaten çalışıyor, dokunma" demez (bkz.
  // GET içindeki isInternalContinuation kontrolü).
  url.searchParams.set("runId", runId)

  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`

  // Vercel Authentication (Deployment Protection) tüm ".vercel.app"
  // URL'lerini korumaya alıyor. Vercel Cron'un İLK çağrısı bu korumayı
  // otomatik atlar, ama bu self-fetch (zincirin kendi kendini tetiklemesi)
  // normal bir dış istek gibi görülür ve engellenir. Bunu aşmak için
  // Protection Bypass for Automation secret'ı header olarak eklenir.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  // Zaman aşımı + yeniden deneme ile — bkz. lib/market-value-cron-run.ts
  // içindeki triggerChainContinuation açıklaması: bunlar OLMADAN, askıda
  // kalan tek bir self-fetch isteği after()'ı maxDuration'a kadar bekletip
  // zinciri hiçbir hata izi bırakmadan sessizce kırabiliyordu.
  await triggerChainContinuation(url.toString(), headers)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const continuationRunId = searchParams.get("runId")

  let run: CronRunRow | null

  if (continuationRunId) {
    // Zincirin içinden gelen bir devam çağrısı — bu isteği BİZ ürettik
    // (triggerNextStep), dolayısıyla heartbeat'in "az önce" güncellenmiş
    // olması normaldir; stale/already-running kontrolüne gerek yok, doğrudan
    // aynı döngüye devam et.
    run = await getActiveCronRun()
    if (!run || run.id !== continuationRunId) {
      // Döngü bu arada başka bir yoldan (örn. admin panelinden manuel devam
      // ettirme) tamamlanmış olabilir.
      return Response.json({ done: true, message: "Döngü zaten tamamlanmış." })
    }
  } else {
    // Dıştan gelen tetikleme: Vercel Cron'un haftalık çağrısı (veya admin'in
    // manuel "yeni döngü başlat" isteği). Devam eden bir "running" döngü
    // varsa ona devam edilir; yoksa yeni bir döngü başlatılır.
    const active = await getActiveCronRun()

    if (!active) {
      run = await startNewCronRun()
    } else if (isCronRunStale(active)) {
      // Zincir kırılmıştı (heartbeat eskimiş) — admin manuel devam ettirmediyse,
      // Vercel Cron'un bir sonraki haftalık tetiklemesi aynı durumu görüp
      // doğrudan devam ettirir.
      console.log(`[v0] Kırılmış döngü (${active.id}) bu istekle devam ettiriliyor.`)
      run = active
    } else {
      // Aktif ve sağlıklı ilerleyen bir döngü zaten var — ikinci bir tanesini
      // başlatıp aynı ligleri iki kez taramamak için hiçbir şey yapma.
      return Response.json({ alreadyRunning: true, runId: active.id, currentLeagueIndex: active.currentLeagueIndex })
    }
  }

  const { run: updatedRun, done } = await processCronRunStep(run)

  if (done) {
    // Zincirdeki son adım: tüm ligler işlendi (veya en fazla deneme sayısı
    // tüketilerek "failed" işaretlendi). hadErrors=false ise artık hiçbir
    // taranan ligde/kadroda görünmeyen "hayalet" kayıtları temizle.
    const cleanup = await cleanupStaleMarketValueRows(updatedRun.runStartedAt, updatedRun.hadErrors)
    await completeCronRun(updatedRun.id)
    return Response.json({
      done: true,
      message: "Tüm ligler işlendi.",
      runId: updatedRun.id,
      hadErrors: updatedRun.hadErrors,
      leagueStatuses: updatedRun.leagueStatuses,
      cleanup,
    })
  }

  // Yanıtı bekletmeden bir sonraki adımı tetikle.
  after(() => triggerNextStep(request, updatedRun.id))

  return Response.json({
    runId: updatedRun.id,
    currentLeagueIndex: updatedRun.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    hadErrors: updatedRun.hadErrors,
  })
}
