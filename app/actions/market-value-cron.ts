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
  triggerChainContinuation,
  type CronRunRow,
} from "@/lib/market-value-cron-run"
import { SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import { sanitize } from "@/lib/site-url"
import { eq, ne } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Admin panelinde haftalık piyasa değeri cron döngüsünün durumunu göstermek
// ve zincir kırıldığında (bkz. lib/market-value-cron-run.ts) beklemeden
// manuel devam ettirmek için kullanılan action'lar.
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
 * Kırılmış (heartbeat eskimiş, "running" durumda kalmış) bir döngüyü beklemeden
 * devam ettirir — watchdog'un (bkz. app/api/cron/resume-market-values,
 * vercel.json'daki sık aralıklı tetikleme) bir sonraki çalışmasını beklemek
 * istemeyen admin için anlık bir yol. Sağlıklı ilerleyen bir döngüye
 * dokunmaz (aynı güvenlik kontrolü resume route'unda da var).
 */
export async function resumeMarketValueCronNow(): Promise<{ triggered: boolean; reason?: string }> {
  await requireAdmin()

  const run = await getLatestCronRun()
  if (!run || run.status !== "running") {
    return { triggered: false, reason: "noActiveRun" }
  }
  if (!isCronRunStale(run)) {
    return { triggered: false, reason: "runHealthy" }
  }

  const secret = process.env.CRON_SECRET
  const headersInit: Record<string, string> = {}
  if (secret) headersInit.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/update-market-values/route.ts — bu fetch de deployment
  // URL'ine gittiği için Vercel Authentication korumasından geçiyor, bypass
  // secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headersInit["x-vercel-protection-bypass"] = bypassSecret

  const base = sanitize(process.env.VERCEL_URL) ? `https://${sanitize(process.env.VERCEL_URL)}` : "http://localhost:3000"
  const url = `${base}/api/cron/resume-market-values`

  // ÖNEMLİ — ÖNCEDEN bu istek `fetch(...).catch(...)` ile beklenmeden
  // (await edilmeden) gönderiliyordu. Bu server action, yanıtı döndürüp
  // (`return { triggered: true }`) bittiği an Vercel bu fonksiyonun
  // çalışmasını dondurabiliyor — bu da isteğin ağa GERÇEKTEN çıkması
  // garanti edilmeden kesilmesine yol açıyordu. Sonuç: buton "tetiklendi"
  // mesajını gösteriyordu ama route'a istek hiç ulaşmıyordu, DB'deki satır
  // hiç değişmiyordu. `after()`, bu callback'i yanıt gönderildikten SONRA
  // ama fonksiyon çalışması bitmeden önce çalıştırıp tamamlanmasını garanti
  // eder (bkz. route.ts'nin kendi zincirleme adımı — aynı deseni kullanır).
  after(() => triggerChainContinuation(url, headersInit))

  revalidatePath(REVIEW_PATH)
  return { triggered: true }
}

/**
 * Admin'in "Şimdi Tara" butonu — aynı 24 ligi zincirleme işleyen tam
 * taramayı hemen başlatır. ÖNEMLİ: bu tarama artık SADECE bu buton ile
 * başlar — vercel.json'daki otomatik haftalık Vercel Cron zamanlaması
 * (her Çarşamba) kaldırıldı. Sağlıklı ilerleyen bir döngü zaten varsa
 * (kısa süre içinde tekrar tıklanırsa) ikinci bir tanesini başlatıp
 * ligleri iki kez taramamak için hiçbir şey yapmaz — bu durumda mevcut
 * döngüye devam edilmesini bekler.
 *
 * Zincirin kendisi app/api/cron/update-market-values route'unda yaşıyor;
 * burada sadece o route'u dıştan (runId parametresi olmadan) tetikliyoruz —
 * route zaten "aktif döngü yoksa yeni başlat, kırılmışsa devam ettir, sağlıklı
 * çalışıyorsa hiçbir şey yapma" mantığını kendi içinde barındırıyor.
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

  const secret = process.env.CRON_SECRET
  const headersInit: Record<string, string> = {}
  if (secret) headersInit.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/update-market-values/route.ts — bu fetch de deployment
  // URL'ine gittiği için Vercel Authentication korumasından geçiyor, bypass
  // secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headersInit["x-vercel-protection-bypass"] = bypassSecret

  const base = sanitize(process.env.VERCEL_URL) ? `https://${sanitize(process.env.VERCEL_URL)}` : "http://localhost:3000"
  const url = `${base}/api/cron/update-market-values`

  // ÖNEMLİ — bu action ÖNCEDEN `await triggerChainContinuation(...)` ile
  // isteği tamamen bekliyordu. Ama hedef route (update-market-values), yanıtı
  // döndürmeden ÖNCE zaman bütçesi dolana kadar (STEP_BUDGET_MS = 260 saniye)
  // gerçek taramayı senkron olarak yapıyor — yani bu action, bu route'un TÜM
  // ilk adım döngüsü bitene kadar bloke oluyordu. Server action'lar aynı
  // sayfa segmentinin fonksiyon süresi sınırına tabidir ve bu sayfa/action
  // dosyası hiçbir yerde `maxDuration` tanımlamıyor (varsayılan çok daha
  // kısa) — bu yüzden action, hedef route yanıt vermeden ÇOK ÖNCE platform
  // tarafından zaman aşımına uğratılıp öldürülüyordu. Admin butona bastığında
  // "tetiklendi" mesajı bile görünmüyordu; sadece buton uzun süre spinner
  // gösterip sonunda sessizce hataya düşüyordu — yani buton "hiçbir şekilde
  // çalışmıyor" gibi görünüyordu.
  //
  // Çözüm: resumeMarketValueCronNow'daki (yukarıdaki) ile AYNI deseni
  // kullan — `after()` ile fire-and-forget. `after()`, callback'i yanıt
  // gönderildikten SONRA ama fonksiyon dondurulmadan ÖNCE çalıştırmayı
  // garanti eder; action anında "tetiklendi" döner, gerçek tarama arka
  // planda (route'un kendi 300s maxDuration'ı içinde) devam eder.
  after(() => triggerChainContinuation(url, headersInit))

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
