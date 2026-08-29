"use server"

import { headers } from "next/headers"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { desc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { playerPosition, playerPositionCronRun } from "@/lib/db/schema"
import { countRemainingCandidates } from "@/lib/player-position-sync"
import { fireChainStepWithoutAwaitingResponse } from "@/lib/fire-chain-step"
import { getSiteUrl } from "@/lib/site-url"

// ---------------------------------------------------------------------------
// Admin panelinde oyuncu mevki (Transfermarkt) backfill'inin durumunu
// göstermek ve manuel olarak başlatmak/silmek için kullanılan action'lar.
//
// ÖNEMLİ MİMARİ — bu backfill artık kendi kendini ZİNCİRLEMİYOR (self-fetch
// chain YOK). Vercel platformu, bir fonksiyonun kendini art arda çağırmasına
// sabit bir 5-sıçrama sınırı koyuyor; 7500+ oyuncu için yüzlerce adım
// gerektiren bu backfill her zaman 5. adımda "508 Loop Detected" ile
// kesiliyordu (bkz. app/api/cron/backfill-player-positions/route.ts'in
// başındaki uzun açıklama). Artık her çağrı SADECE TEK bir batch işleyip
// dönüyor; "Şimdi Tara" butonu (aşağıdaki triggerPlayerPositionScanNow) SADECE
// İLK batch'i başlatıyor — devamını DIŞARIDAN periyodik bir zamanlayıcı
// (örn. cron-job.org, her 1 dakikada bir bu route'a GET atarak) sağlıyor.
// Dışarıdan gelen her çağrı platform için bağımsız/"hop 0" sayıldığından
// 5-sıçrama sınırına hiç dokunulmuyor.
//
// "Şimdi Tara" düğmesi tek başına TÜM taramayı bitirmez — sadece zamanlayıcı
// kurulana kadar birer birer ilerlemeyi elle tetiklemek için de kullanılabilir.
//
// run satırı deseni: app/api/cron/backfill-player-positions devam eden
// ("running") bir satır varsa onu yeniden kullanır, yoksa yeni bir satır
// açar — "en son satır" tüm koşunun toplam ilerlemesini gösterir. Genel
// ilerleme (kaç oyuncu kaldı) ayrıca doğrudan veritabanından
// (countRemainingCandidates) canlı hesaplanır.
// ---------------------------------------------------------------------------

const ADMIN_PATH = "/admin"

/**
 * Bir "running" satırın son batch'inden bu kadar süre sonra hâlâ heartbeat
 * tazelenmemişse "kırılmış/durmuş" sayılır. Artık her batch'i DIŞARIDAN bir
 * zamanlayıcı (örn. cron-job.org, önerilen aralık: 1 dakika) tetikliyor —
 * her başarılı çağrı heartbeat'i tazeler. Bu eşik, zamanlayıcının bir-iki
 * çağrıyı atlamasına tolerans tanıyacak kadar geniş (6 dakika ≈ zamanlayıcı
 * aralığının 6 katı) ama zamanlayıcı tamamen durursa admin panelinin
 * "kırıldı" uyarısını göstermesi için yeterince kısa tutuldu. Zamanlayıcı
 * aralığını değiştirirsen bu değeri de ona göre (en az ~5-6x) ayarla.
 *
 * ÖNEMLİ — bu kontrol `run.heartbeatAt`'e bakar, `run.runStartedAt`'a DEĞİL.
 * Satır koşu boyunca (tüm dış çağrılar için) TEK ve aynı olduğundan
 * (bkz. app/api/cron/backfill-player-positions), runStartedAt SADECE
 * koşunun en başında bir kere yazılır ve tüm koşu boyunca sabit kalır — bu
 * yüzden saatlerce sürmesi normal olan (binlerce oyuncu) bir koşuyu
 * runStartedAt'a göre "eskimiş" saymak yanlış olurdu.
 */
const STALE_RUN_MS = 6 * 60 * 1000

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    console.error(
      `[v0] Admin yetkisi reddedildi (oyuncu mevki backfill) — oturumdaki e-posta: ${session?.user?.email ?? "(oturum yok)"}`,
    )
    throw new Error(`Unauthorized: ${session?.user?.email ?? "no session"}`)
  }
}

export interface PlayerPositionCronStatus {
  hasRun: boolean
  runId: string | null
  status: "running" | "completed" | "failed" | null
  runStartedAt: string | null
  runFinishedAt: string | null
  playersProcessed: number
  playersMatched: number
  lastError: string | null
  isStale: boolean
  remainingCandidates: number
  isDone: boolean
}

/** Admin panelinde göstermek için: en son batch satırının durumu + canlı hesaplanan kalan oyuncu sayısı. */
export async function getPlayerPositionCronStatus(): Promise<PlayerPositionCronStatus> {
  await requireAdmin()

  const [latest, remainingCandidates] = await Promise.all([
    db.select().from(playerPositionCronRun).orderBy(desc(playerPositionCronRun.createdAt)).limit(1),
    countRemainingCandidates(),
  ])

  const run = latest[0]
  const isDone = remainingCandidates === 0

  if (!run) {
    return {
      hasRun: false,
      runId: null,
      status: null,
      runStartedAt: null,
      runFinishedAt: null,
      playersProcessed: 0,
      playersMatched: 0,
      lastError: null,
      isStale: false,
      remainingCandidates,
      isDone,
    }
  }

  const status = run.status as "running" | "completed" | "failed"
  const isStale = status === "running" && Date.now() - run.heartbeatAt.getTime() > STALE_RUN_MS

  return {
    hasRun: true,
    runId: run.id,
    status,
    runStartedAt: run.runStartedAt.toISOString(),
    runFinishedAt: run.runFinishedAt ? run.runFinishedAt.toISOString() : null,
    playersProcessed: run.playersProcessed,
    playersMatched: run.playersMatched,
    lastError: run.lastError,
    isStale,
    remainingCandidates,
    isDone,
  }
}

/**
 * Admin'in "Şimdi Tara" butonu — mevki backfill'ini (bkz. app/api/cron/
 * backfill-player-positions) hemen, TEK bir batch için tetikler.
 *
 * ÖNEMLİ — bu artık "tüm taramayı başlatıp bitirene kadar kendi kendine
 * devam eden bir zincir" DEĞİL (bkz. yukarıdaki dosya başı açıklaması —
 * self-fetch zincirleme Vercel'in 5-sıçrama limitine çarpıyordu). Bu buton
 * sadece İLK/bir sonraki batch'i elle tetikler; taramanın gerçekten uçtan
 * uca bitmesi için dışarıdan periyodik bir zamanlayıcının (örn. cron-job.org)
 * bu route'a düzenli GET istekleri göndermesi gerekiyor. Zamanlayıcı kurulu
 * değilse, bu butona tekrar tekrar basmak da işi (yavaşça, tıklama başına
 * bir batch) bitirebilir ama pratik değildir.
 *
 * Sağlıklı ilerleyen (kısa süre önce başlamış, hâlâ "running") bir batch
 * zaten varsa ikinci bir batch'i aynı anda tetikleyip aynı oyuncuları çift
 * işlemeyi önlemek için hiçbir şey yapmaz. Zaten işlenecek oyuncu kalmadıysa
 * da (isDone) tetiklemez.
 */
export async function triggerPlayerPositionScanNow(): Promise<{ triggered: boolean; reason?: string }> {
  await requireAdmin()

  const [latest] = await db.select().from(playerPositionCronRun).orderBy(desc(playerPositionCronRun.createdAt)).limit(1)

  if (latest && latest.status === "running") {
    const isStale = Date.now() - latest.heartbeatAt.getTime() > STALE_RUN_MS
    if (!isStale) {
      return { triggered: false, reason: "scanAlreadyRunning" }
    }
    // Stale — self-fetch zinciri muhtemelen bir yerde kırılmış, yeniden
    // tetiklemeye izin ver (route zaten durumsuz ilerlediği için ikinci bir
    // tetikleme veriyi bozmaz, en kötü ihtimalle aynı oyuncu tekrar çekilir).
  }

  const remaining = await countRemainingCandidates()
  if (remaining === 0) {
    return { triggered: false, reason: "noRemainingCandidates" }
  }

  const secret = process.env.CRON_SECRET
  // ÖNEMLİ — bu header, app/api/cron/backfill-player-positions/route.ts'e
  // "bu çağrı admin'in Şimdi Tara butonundan geliyor, dış zamanlayıcıdan
  // DEĞİL" bilgisini taşır. Route, devam eden bir koşu yoksa YENİ bir koşuyu
  // SADECE bu header varsa açar — böylece GitHub Actions cron'u kullanıcı
  // hiç dokunmadan kendiliğinden bir tarama başlatamaz, sadece admin'in
  // başlattığı bir koşuyu devam ettirebilir.
  const headersInit: Record<string, string> = { "x-player-position-manual-trigger": "1" }
  if (secret) headersInit.authorization = `Bearer ${secret}`

  // Bkz. app/api/cron/backfill-player-positions/route.ts — bu fetch de
  // deployment URL'ine gittiği için Vercel Authentication korumasından
  // geçiyor, bypass secret'ı gerekiyor.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headersInit["x-vercel-protection-bypass"] = bypassSecret

  // ÖNEMLİ — sadece VERCEL_URL'e bakmak YERİNE getSiteUrl()'ün tam fallback
  // zincirini (BETTER_AUTH_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL
  // -> V0_RUNTIME_URL -> localhost) kullanıyoruz — bazı ortamlarda (örn. v0
  // sandbox) VERCEL_URL tanımsız olabilir, bu durumda eski kod sessizce
  // "http://localhost:3000"e düşüyordu.
  const url = `${getSiteUrl()}/api/cron/backfill-player-positions`

  // `after()` ile fire-and-forget: bu callback, yanıt gönderildikten SONRA
  // ama fonksiyon dondurulmadan ÖNCE çalıştırılması garanti edilir; action
  // anında "tetiklendi" döner, tek batch'lik gerçek işlem arka planda devam
  // eder. fireChainStepWithoutAwaitingResponse SADECE hızlı bir hatayı (401
  // vb.) yakalayacak kısa bir pencere bekler, isteği İPTAL ETMEDEN döner —
  // route zaten bu TEK batch'i işleyip dönecek, kendi kendini tekrar
  // tetiklemeyecek (bkz. dosya başı açıklaması).
  after(() => fireChainStepWithoutAwaitingResponse(url, headersInit))

  revalidatePath(ADMIN_PATH)
  return { triggered: true }
}

export interface ResetPlayerPositionDataResult {
  deletedPositions: number
  deletedCronRuns: number
}

/**
 * Admin'in "Tümünü Sıfırla" butonu — çekilmiş TÜM oyuncu mevki verilerini
 * (player_position) ve backfill çalışma günlüğünü (player_position_cron_run)
 * kalıcı olarak siler. Piyasa değeri/oyuncu eşleştirme verisine (player_
 * market_value) DOKUNMAZ — sadece mevki verisi sıfırlanır, bir sonraki
 * tarama tüm adayları sıfırdan (unverified) yeniden işler.
 */
export async function resetAllPlayerPositionData(): Promise<ResetPlayerPositionDataResult> {
  await requireAdmin()

  const [deletedPositions, deletedCronRuns] = await Promise.all([
    db.delete(playerPosition).returning({ id: playerPosition.id }),
    db.delete(playerPositionCronRun).returning({ id: playerPositionCronRun.id }),
  ])

  revalidatePath(ADMIN_PATH)

  return {
    deletedPositions: deletedPositions.length,
    deletedCronRuns: deletedCronRuns.length,
  }
}
