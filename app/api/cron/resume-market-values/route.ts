import { after } from "next/server"
import { cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import {
  getActiveCronRun,
  processCronRunStep,
  completeCronRun,
  isCronRunStale,
  triggerChainContinuation,
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
  // içindeki triggerChainContinuation açıklaması.
  await triggerChainContinuation(url.toString(), headers)
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

  const { run: updatedRun, done } = await processCronRunStep(run)

  if (done) {
    const cleanup = await cleanupStaleMarketValueRows(updatedRun.runStartedAt, updatedRun.hadErrors)
    await completeCronRun(updatedRun.id)
    return Response.json({
      resumed: true,
      done: true,
      runId: updatedRun.id,
      hadErrors: updatedRun.hadErrors,
      cleanup,
    })
  }

  after(() => triggerNextResumeStep(request, updatedRun.id))

  return Response.json({
    resumed: true,
    done: false,
    runId: updatedRun.id,
    currentLeagueIndex: updatedRun.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
  })
}
