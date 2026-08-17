import { after } from "next/server"
import { cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import {
  getActiveCronRun,
  processCronRunStep,
  completeCronRun,
  isCronRunStale,
  runMatchesCurrentLeagueList,
  triggerChainContinuation,
  type CronRunRow,
} from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// Haftalık piyasa değeri cron zinciri (bkz. app/api/cron/update-market-values)
// bir yerde kesilirse (serverless zaman aşımı, crash, after()'ın tetikledi ği
// fetch'in ağ hatasıyla başarısız olması vb.) bu route kaldığı yerden devam
// ettirir.
//
// Bu route otomatik bir zamanlamayla ÇALIŞMAZ (vercel.json'da bu route için
// bir cron tanımlı değil) — sadece admin panelindeki "Devam Ettir" butonuyla
// (bkz. app/actions/market-value-cron.ts) manuel olarak tetiklenir. Otomatik
// tetiklenmesi istenirse vercel.json'a bu route için bir cron eklenmelidir.
//
// Bu route ANA cron'un yaptığını yapmaz: YENİ bir haftalık döngü ASLA
// başlatmaz — sadece heartbeat'i eskimiş (STALE_HEARTBEAT_MS'den daha uzun
// süredir güncellenmemiş) "running" bir döngü bulursa, kaldığı ligden devam
// eder. Sağlıklı ilerleyen bir döngüye veya döngü yoksa hiçbir şeye
// dokunmaz.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Bkz. app/api/cron/update-market-values/route.ts — aynı zaman bütçesi
// deseni: her çağrı, gereken self-fetch sayısını (ve kırılma riskini) tek
// haneli sayılara indirmek için birden çok adımı arka arkaya işler.
const STEP_BUDGET_MS = 260_000

// ÖNEMLİ — bkz. app/api/cron/update-market-values/route.ts'nin başındaki kök
// neden açıklaması: bu route da AYNI hatayı taşıyordu — ağır işi (yukarıdaki
// STEP_BUDGET_MS'lik do-while) yanıt dönmeden ÖNCE senkron yapıyordu, ama
// zinciri tetikleyen self-fetch yanıtı sadece 15 saniye bekliyordu. Aynı
// çözüm burada da uygulanıyor: yanıt hemen dönülüyor, ağır iş after() içinde
// yapılıyor (bkz. runResumeBatchAndContinue).

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function triggerNextResumeStep(request: Request, runId: string): Promise<void> {
  const url = new URL(request.url)
  // Bkz. app/api/cron/update-market-values/route.ts — aynı "runId ile işaretli
  // devam çağrısı bypass eder" deseni: bu çağrı zincirin İÇİNDEN geliyor,
  // dolayısıyla heartbeat'in az önce tazelenmiş olması "zincir sağlıklı,
  // dokunma" olarak yanlış yorumlanmamalı.
  url.searchParams.set("runId", runId)

  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/update-market-values/route.ts — self-fetch, Vercel
  // Authentication (Deployment Protection) tarafından engellenmemesi için
  // Protection Bypass for Automation secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  // Zaman aşımı + yeniden deneme ile — bkz. lib/market-value-cron-run.ts
  // içindeki triggerChainContinuation açıklaması. Callee artık hemen ack
  // döndüğü için 15 saniyelik zaman aşımı burada gerçekten yeterli.
  await triggerChainContinuation(url.toString(), headers)
}

/**
 * Asıl ağır işi (art arda adım işleme + tamamlanınca cleanup) yapar ve
 * ardından bir sonraki adımı tetikler. GET handler'ı yanıtı döndürdükten
 * SONRA after() içinde çağrılır — bkz. dosya başındaki kök neden açıklaması.
 */
async function runResumeBatchAndContinue(request: Request, initialRun: CronRunRow): Promise<void> {
  const startedAt = Date.now()
  let updatedRun = initialRun
  let done = false

  do {
    const step = await processCronRunStep(updatedRun)
    updatedRun = step.run
    done = step.done
  } while (!done && Date.now() - startedAt < STEP_BUDGET_MS)

  if (done) {
    await cleanupStaleMarketValueRows(updatedRun.runStartedAt, updatedRun.hadErrors)
    await completeCronRun(updatedRun.id)
    return
  }

  await triggerNextResumeStep(request, updatedRun.id)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const continuationRunId = searchParams.get("runId")

  const run = await getActiveCronRun()

  if (!run) {
    return Response.json({ resumed: false, reason: "Devam eden bir döngü yok." })
  }

  if (!runMatchesCurrentLeagueList(run)) {
    // Bkz. lib/market-value-cron-run.ts -> runMatchesCurrentLeagueList: bu
    // satır, lig listesi değişmeden önce başlatılmış — devam ettirmek
    // yanlış ligin verisini yazabilir. Devam ettirmiyoruz; bu eski satırı
    // kapatıyoruz ki ana cron route'u (veya admin'in "Şimdi Tara" butonu)
    // bir sonraki tetiklemede güncel listeyle sıfırdan bir döngü başlatsın.
    console.warn(
      `[v0] Devam ettirilecek döngü (${run.id}) güncel lig listesiyle uyuşmuyor — kapatılıyor, devam ettirilmiyor.`,
    )
    await completeCronRun(run.id)
    return Response.json({
      resumed: false,
      reason: "Lig listesi değişti, eski döngü artık geçersiz — kapatıldı. Bir sonraki tarama sıfırdan başlayacak.",
      runId: run.id,
    })
  }

  if (continuationRunId) {
    if (run.id !== continuationRunId) {
      return Response.json({ resumed: true, done: true, reason: "Döngü zaten tamamlanmış." })
    }
    // Zincirin içinden gelen devam çağrısı — staleness kontrolüne gerek yok.
  } else if (!isCronRunStale(run)) {
    // Dıştan gelen (örn. admin panelinden manuel) bir istek ve döngü
    // sağlıklı ilerliyor (yakın zamanda bir heartbeat var) — devam
    // ettirmeye çalışırsak aynı ligi iki kez işleriz. Dokunma.
    return Response.json({ resumed: false, reason: "Döngü zaten sağlıklı ilerliyor, dokunmaya gerek yok.", runId: run.id })
  } else {
    console.log(`[v0] Kırılmış döngü tespit edildi (${run.id}), lig index ${run.currentLeagueIndex}'ten devam ediliyor.`)
  }

  // ÖNEMLİ — asıl ağır iş burada SENKRON yapılmıyor, hemen yanıt dönülüyor —
  // bkz. dosya başındaki kök neden açıklaması ve runResumeBatchAndContinue.
  after(() => runResumeBatchAndContinue(request, run))

  return Response.json({
    resumed: true,
    started: true,
    runId: run.id,
    currentLeagueIndex: run.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
  })
}
