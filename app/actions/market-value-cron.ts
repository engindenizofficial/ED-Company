"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import {
  getLatestCronRun,
  isCronRunStale,
  fireChainStepWithoutAwaitingResponse,
  setChainError,
  startNewCronRun,
  wipeAllMarketValueData,
  type CronRunRow,
} from "@/lib/market-value-cron-run"
import { SCRAPABLE_LEAGUE_IDS } from "@/lib/transfermarkt-scraper"
import { getSiteUrl } from "@/lib/site-url"

// ---------------------------------------------------------------------------
// Admin panelinde haftalık piyasa değeri cron döngüsünün durumunu göstermek
// ve manuel olarak başlatmak için kullanılan action'lar.
//
// ÖNEMLİ MİMARİ — bu döngü artık kendi kendini ZİNCİRLEMİYOR (self-fetch
// chain YOK, bkz. app/api/cron/update-market-values/route.ts başındaki
// açıklama — Vercel'in 5-sıçrama self-fetch limiti yüzünden zincir her
// zaman aynı noktalarda "508 Loop Detected" ile kesiliyordu). "Şimdi Tara"
// butonu SADECE İLK (veya bir sonraki) batch'i tetikler; devamını DIŞARIDAN
// periyodik bir zamanlayıcı (QStash, bkz. scripts/setup-qstash-schedules.mjs)
// sağlar. Bu yüzden ayrı bir "resume" action'ı/route'u da yok — devam eden
// bir koşuyu QStash otomatik ilerletir, admin isterse "Şimdi Tara"ya tekrar
// basarak da elle bir adım daha tetikleyebilir.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    // ÖNEMLİ — bu action'lar önceden burada fırlayan hatayı bileşende hiç
    // yakalamıyordu (bkz. market-value-cron-status.tsx), admin butona
    // bastığında ekranda hiçbir şey değişmiyordu. Artık hem bileşen hatayı
    // gösteriyor hem de burada hangi e-posta ile (veya oturumsuz) reddedildiği
    // sunucu loguna yazılıyor — bir dahaki sefere buton "çalışmazsa" sebep
    // (oturum yok / farklı hesap / e-posta eşleşmiyor) buradan görülebilir.
    console.error(
      `[v0] Admin yetkisi reddedildi — oturumdaki e-posta: ${session?.user?.email ?? "(oturum yok)"}`,
    )
    throw new Error(`Unauthorized: ${session?.user?.email ?? "no session"}`)
  }
}

export interface CronRunStatus {
  runId: string
  status: "running" | "completed"
  runStartedAt: string
  currentLeagueIndex: number
  totalLeagues: number
  hadErrors: boolean
  isStale: boolean
  failedLeagueIds: number[]
  heartbeatAt: string
  /**
   * Zincirin bir sonraki adımını tetikleyen self-fetch'in son (tüm
   * denemeler tükendikten sonraki) GERÇEK hata mesajı — örn. "HTTP 401
   * Unauthorized". Bu ÖNCEDEN sadece sunucu loglarında kalıyordu; admin
   * panelinde sadece "zincir kırıldı" (heartbeat eskimiş) görünüyordu, asıl
   * sebep hiç gösterilmiyordu. Bkz. lib/market-value-cron-run.ts -> setChainError.
   */
  lastChainError: string | null
  lastChainErrorAt: string | null
}

function toStatus(run: CronRunRow): CronRunStatus {
  return {
    runId: run.id,
    status: run.status,
    runStartedAt: run.runStartedAt.toISOString(),
    currentLeagueIndex: run.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    hadErrors: run.hadErrors,
    isStale: run.status === "running" && isCronRunStale(run),
    failedLeagueIds: run.leagueStatuses.filter((entry) => entry.status === "failed").map((entry) => entry.leagueId),
    heartbeatAt: run.heartbeatAt.toISOString(),
    lastChainError: run.lastChainError,
    lastChainErrorAt: run.lastChainErrorAt ? run.lastChainErrorAt.toISOString() : null,
  }
}

/** Admin panelinde göstermek için en son cron döngüsünün durumunu döndürür. */
export async function getMarketValueCronStatus(): Promise<CronRunStatus | null> {
  await requireAdmin()
  const run = await getLatestCronRun()
  return run ? toStatus(run) : null
}

/**
 * Admin panelindeki TEK buton: "Taramayı Başlat".
 *
 * ÖNEMLİ — kilit/manualOverride veya "onaylananları koru" gibi bir kavram
 * YOK. Bu action her çağrıldığında, devam eden bir tarama olsa da olmasa
 * da, KOŞULSUZ olarak:
 *   1) Piyasa değeri sistemine ait TÜM veriyi siler (lig/takım/oyuncu piyasa
 *      değerleri, review kuyruğu, önceki tüm cron koşuları — bkz.
 *      wipeAllMarketValueData) — "boş sayfa"dan başlar.
 *   2) Yeni bir cron koşusu açar ve ilk adımı hemen tetikler.
 *
 * Taramanın uçtan uca bitmesi, dışarıdaki QStash zamanlayıcısının (bkz.
 * scripts/setup-qstash-schedules.mjs, "update-market-values", 1 dakikada
 * bir) bu route'u tekrar tekrar çağırarak "running" koşuyu adım adım
 * ilerletmesiyle sağlanır — bir adım hata verip dursa bile en fazla 1
 * dakika içinde otomatik olarak devam eder.
 */
export async function startMarketValueScan(): Promise<{ started: boolean; runId?: string; reason?: string }> {
  await requireAdmin()

  await wipeAllMarketValueData()
  const run = await startNewCronRun()

  const secret = process.env.CRON_SECRET
  const headersInit: Record<string, string> = {}
  if (secret) headersInit.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/update-market-values/route.ts — bu fetch de deployment
  // URL'ine gittiği için Vercel Authentication korumasından geçiyor, bypass
  // secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headersInit["x-vercel-protection-bypass"] = bypassSecret

  const url = `${getSiteUrl()}/api/cron/update-market-values`

  // Bu fonksiyon isteği gönderir, SADECE hızlı bir hatayı (401, ağ hatası)
  // yakalayacak kısa bir pencere bekler, sonra isteği İPTAL ETMEDEN döner —
  // route kendi 300s maxDuration'ı içinde arka planda çalışmaya devam eder.
  // Bir sonraki adım gerekirse dış QStash zamanlayıcısı (1 dakikada bir)
  // devam ettirir.
  try {
    await fireChainStepWithoutAwaitingResponse(url, headersInit)
    await setChainError(run.id, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[v0] Piyasa değeri taraması tetiklenemedi:", err)
    await setChainError(run.id, message)
    // Tetikleme başarısız olsa da koşu "running" olarak DB'de kalır — dış
    // QStash zamanlayıcısı bir dakika içinde bu koşuyu otomatik ilerletir,
    // o yüzden bunu hata olarak DÖNDÜRMÜYORUZ.
  }

  revalidatePath(REVIEW_PATH)
  return { started: true, runId: run.id }
}
