"use server"

import { headers } from "next/headers"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { teamMarketValue, playerMarketValue, marketValueReviewQueue, marketValueCronRun } from "@/lib/db/schema"
import {
  getActiveCronRun,
  getLatestCronRun,
  isCronRunStale,
  fireChainStepWithoutAwaitingResponse,
  setChainError,
  type CronRunRow,
} from "@/lib/market-value-cron-run"
import { SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import { getSiteUrl } from "@/lib/site-url"
import { eq, ne } from "drizzle-orm"

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
 * Admin'in "Şimdi Tara" butonu — 24 ligi işleyen döngünün SADECE bir sonraki
 * batch'ini (bkz. app/api/cron/update-market-values, STEP_BUDGET_MS = 260s
 * içinde art arda işlenen adımlar) hemen tetikler.
 *
 * ÖNEMLİ — bu artık "tüm taramayı başlatıp bitirene kadar kendi kendine
 * devam eden bir zincir" DEĞİL (bkz. route.ts'in dosya başı açıklaması —
 * self-fetch zincirleme Vercel'in 5-sıçrama limitine çarpıp "508 Loop
 * Detected" ile kesiliyordu, tıpkı oyuncu mevki backfill'inde olduğu gibi).
 * Bu buton sadece İLK/bir sonraki batch'i elle tetikler; taramanın uçtan uca
 * bitmesi dışarıdaki QStash zamanlayıcısının (bkz.
 * scripts/setup-qstash-schedules.mjs, "update-market-values", 5 dakikada
 * bir) periyodik çağrılarıyla sağlanır. Zamanlayıcı zaten kurulu olduğu için
 * admin'in tekrar tekrar butona basmasına normalde gerek yoktur.
 *
 * Sağlıklı ilerleyen (kısa süre önce heartbeat almış, hâlâ "running") bir
 * döngü zaten varsa ikinci bir batch'i aynı anda tetikleyip aynı ligi çift
 * işlemeyi önlemek için hiçbir şey yapmaz.
 */
export async function triggerMarketValueScanNow(): Promise<{ triggered: boolean; reason?: string }> {
  await requireAdmin()

  // ÖNEMLİ: Admin'in onayladığı eşleşmelerin manualOverride kilidini
  // kesinlikle kaldırmıyoruz. Senkronizasyon zaten kilitli kayıtlarda doğru
  // Transfermarkt profilini koruyup yalnızca o profilin güncel piyasa değerini
  // yeniliyor. Böylece "Şimdi Tara" eski veriyi güncellerken admin kararını
  // silmez.
  const active = await getActiveCronRun()
  if (active && !isCronRunStale(active)) {
    return { triggered: false, reason: "scanAlreadyRunning" }
  }
  // Stale (heartbeat eskimiş) bir koşu varsa — self-fetch zinciri artık hiç
  // olmadığı için "stale" burada sadece "QStash henüz bir tur atmadı"
  // anlamına gelir; devam ettirmeye izin veriyoruz, route zaten aynı satırı
  // yeniden kullanıp kaldığı yerden ilerler.

  const secret = process.env.CRON_SECRET
  // ÖNEMLİ — bu header, route'a "bu çağrı admin'in Şimdi Tara butonundan
  // geliyor, dış zamanlayıcıdan DEĞİL" bilgisini taşır. Route, devam eden
  // bir koşu yoksa YENİ bir koşuyu SADECE bu header varsa açar — böylece
  // QStash kullanıcı hiç dokunmadan kendiliğinden bir haftalık tarama
  // başlatamaz, sadece admin'in başlattığı bir koşuyu devam ettirebilir.
  const headersInit: Record<string, string> = { "x-market-value-manual-trigger": "1" }
  if (secret) headersInit.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/update-market-values/route.ts — bu fetch de deployment
  // URL'ine gittiği için Vercel Authentication korumasından geçiyor, bypass
  // secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headersInit["x-vercel-protection-bypass"] = bypassSecret

  const url = `${getSiteUrl()}/api/cron/update-market-values`

  // ÖNEMLİ — bu action ÖNCEDEN `await triggerChainContinuation(...)` ile
  // isteği TAM YANITINI bekleyerek gönderiyordu (15s zaman aşımı). Ama hedef
  // route (update-market-values) artık zaman bütçesi (STEP_BUDGET_MS = 260s)
  // dolana kadar senkron olarak çalışıp öyle yanıt veriyor — 15s'lik bir
  // zaman aşımı bu route için KESİNLİKLE yetersiz, "zaman aşımı" deyip
  // isteği tekrar göndermek sunucudaki ilk isteği iptal etmeden AYNI ligi
  // ikinci kez işleyen paralel bir çağrı başlatırdı (bkz.
  // lib/market-value-cron-run.ts -> fireChainStepWithoutAwaitingResponse
  // açıklaması). Bu fonksiyon isteği gönderir, SADECE hızlı bir hatayı (401,
  // ağ hatası) yakalayacak kısa bir pencere bekler, sonra isteği İPTAL
  // ETMEDEN döner — route kendi 300s maxDuration'ı içinde arka planda
  // çalışmaya devam eder.
  try {
    await fireChainStepWithoutAwaitingResponse(url, headersInit)
    if (active) await setChainError(active.id, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[v0] Piyasa değeri taraması tetiklenemedi:", err)
    if (active) await setChainError(active.id, message)
    return { triggered: false, reason: "triggerFailed" }
  }

  revalidatePath(REVIEW_PATH)
  return { triggered: true }
}

export interface ResetMarketValueDataResult {
  deletedTeams: number
  deletedPlayers: number
  deletedReviewEntries: number
  deletedCronRuns: number
}

/**
 * Admin'in "Tümünü Sıfırla" butonu — piyasa değeri sistemine ait TÜM verileri
 * kalıcı olarak siler: takım/oyuncu piyasa değerleri (ve bunlarla birlikte
 * gelen matchStatus/manualOverride kilitleri dahil), onay/red kuyruğu
 * (market_value_review_queue) ve haftalık tarama döngüsünün ilerleme kaydı
 * (market_value_cron_run — silinmezse, verisi artık var olmayan eski bir
 * döngü admin panelinde "durum" olarak görünmeye devam ederdi).
 *
 * Bu, cron'un/senkronun kod tarafına DOKUNMAZ — bir sonraki tarama (haftalık
 * ya da "Şimdi Tara" ile manuel) her takımı/oyuncuyu sıfırdan, hiç admin
 * kararı yokmuş gibi yeniden eşleştirir.
 */
export async function resetAllMarketValueData(): Promise<ResetMarketValueDataResult> {
  await requireAdmin()

  // Admin tarafından manuel onaylanan kayıtlar `manualOverride = true` ile
  // kilitlenir. Reset yalnızca otomatik/henüz onaylanmamış kayıtları siler;
  // onaylı eşleşmeler, değerleri ve review geçmişi korunur.
  const [deletedTeams, deletedPlayers, deletedReviewEntries, deletedCronRuns] = await Promise.all([
    db.delete(teamMarketValue).where(eq(teamMarketValue.manualOverride, false)).returning({ id: teamMarketValue.id }),
    db.delete(playerMarketValue).where(eq(playerMarketValue.manualOverride, false)).returning({ id: playerMarketValue.id }),
    db.delete(marketValueReviewQueue).where(ne(marketValueReviewQueue.status, "approved")).returning({ id: marketValueReviewQueue.id }),
    db.delete(marketValueCronRun).returning({ id: marketValueCronRun.id }),
  ])

  revalidatePath(REVIEW_PATH)

  return {
    deletedTeams: deletedTeams.length,
    deletedPlayers: deletedPlayers.length,
    deletedReviewEntries: deletedReviewEntries.length,
    deletedCronRuns: deletedCronRuns.length,
  }
}
