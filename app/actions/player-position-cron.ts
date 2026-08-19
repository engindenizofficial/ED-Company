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
import { triggerChainContinuation } from "@/lib/market-value-cron-run"
import { getSiteUrl } from "@/lib/site-url"

/**
 * Bir sonraki adımın TAM yanıtını bekleyecek zaman aşımı — route.ts'teki
 * NEXT_STEP_TIMEOUT_MS ile AYNI değer (bkz. o dosyadaki açıklama): worst-case
 * adım süresi ~115s (SOFT_TIME_BUDGET_MS 70s + son adayın tam 3 tekrar
 * denemesi ~45s), bu yüzden 150s güvenli bir pay bırakıyor.
 */
const CHAIN_STEP_TIMEOUT_MS = 150_000

// ---------------------------------------------------------------------------
// Admin panelinde oyuncu mevki (Transfermarkt) backfill'inin durumunu
// göstermek ve manuel olarak başlatmak/silmek için kullanılan action'lar —
// piyasa değeri sistemindeki app/actions/market-value-cron.ts ile aynı
// desen (aynı requireAdmin kontrolü, aynı bypass/secret header'ları, aynı
// after() ile fire-and-forget tetikleme).
//
// ÖNEMLİ FARK: bu backfill'in market değeri döngüsü gibi TEK bir kalıcı
// "run" satırı yok — app/api/cron/backfill-player-positions her batch'te
// (bkz. lib/player-position-sync.ts BATCH_SIZE) YENİ bir
// player_position_cron_run satırı oluşturup onu aynı istekte sonuçlandırır.
// Yani "en son satır" sadece son işlenen batch'i gösterir; genel ilerleme
// (kaç oyuncu kaldı) doğrudan veritabanından (countRemainingCandidates)
// canlı hesaplanır — bu satırlarda tutulmaz.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

/**
 * Bir "running" satırın son batch'inden bu kadar süre sonra hâlâ heartbeat
 * tazelenmemişse "zincir kırılmış" sayılır. Her batch kendi maxDuration
 * (300s) penceresi içinde ya biter (heartbeat tazelenir) ya da bir sonraki
 * batch'i tetikler (o da heartbeat'i tazeler) — bu sürenin çok üzerinde
 * heartbeat'in hiç tazelenmemesi self-fetch'in veya sunucunun bir yerde
 * durduğunu gösterir.
 *
 * ÖNEMLİ — bu kontrol `run.heartbeatAt`'e bakar, `run.runStartedAt`'a DEĞİL.
 * Satır zincir boyunca (tüm batch'ler için) TEK ve aynı olduğundan
 * (bkz. app/api/cron/backfill-player-positions), runStartedAt SADECE
 * zincirin en başında bir kere yazılır ve tüm koşu boyunca sabit kalır.
 * Eskiden bu kontrol runStartedAt'a bakıyordu — bu, saatlerce sürmesi normal
 * olan (binlerce oyuncu) sapasağlam ilerleyen bir zincirin bile 6 dakika
 * sonra hep "kırılmış" görünmesine yol açıyordu; daha da kötüsü, "Şimdi
 * Tara"ya basıldığında bu yanlış "stale" bilgisiyle, hâlâ arka planda
 * çalışan sağlıklı bir batch'in ÜSTÜNE paralel bir ikinci batch tetiklenip
 * Transfermarkt'a çift istek gidiyor, bot koruması daha çok tetiklenip
 * asıl kırılmaya yol açıyordu.
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
 * backfill-player-positions) hemen tetikler. Bu route'a vercel.json'da
 * hiçbir zaman otomatik bir zamanlama tanımlanmadı — bilinçli olarak SADECE
 * bu buton (veya route'a manuel bir istek) ile başlar.
 *
 * Sağlıklı ilerleyen (kısa süre önce başlamış, hâlâ "running") bir batch
 * zaten varsa ikinci bir zincir başlatıp aynı oyuncuları çift işlemeyi
 * önlemek için hiçbir şey yapmaz. Zaten işlenecek oyuncu kalmadıysa da
 * (isDone) tetiklemez.
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
  const headersInit: Record<string, string> = {}
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

  // Piyasa değeri action'larıyla AYNI desen — `after()` ile fire-and-forget,
  // ama bu callback'in İÇİNDE artık route'un TAM yanıtını bekleyen, başarısız
  // denemeleri tekrar eden triggerChainContinuation kullanılıyor (bkz. lib/
  // market-value-cron-run.ts). `after()`, callback'i yanıt gönderildikten
  // SONRA ama fonksiyon dondurulmadan ÖNCE çalıştırmayı garanti eder; action
  // anında "tetiklendi" döner, gerçek backfill arka planda devam eder.
  //
  // ÖNEMLİ GEÇMİŞ — burada ÖNCEDEN fireChainStepWithoutAwaitingResponse
  // (tam yanıtı beklemeyen, sadece isteği "ateşleyip" hemen dönen)
  // kullanılıyordu, çünkü route'un bir batch'i işlemesi eskiden (SOFT_TIME_
  // BUDGET_MS=190s) 190-237 saniyeye kadar sürebiliyordu. SOFT_TIME_BUDGET_MS
  // artık 70s'e düşürüldüğü için (bkz. lib/player-position-sync.ts) route'un
  // worst-case süresi ~115s'ye indi — bu action'ın kendi after() bloğunun
  // (bu Server Action'ın maxDuration'ı yoksa dahi) CHAIN_STEP_TIMEOUT_MS
  // (150s) kadar güvenle bekleyebilmesine yetiyor. Bu sayede ilk tetikleme de
  // artık route.ts'teki triggerNextStep ile AYNI dayanıklı deseni kullanıyor.
  after(() => triggerChainContinuation(url, headersInit, CHAIN_STEP_TIMEOUT_MS))

  revalidatePath(REVIEW_PATH)
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

  revalidatePath(REVIEW_PATH)

  return {
    deletedPositions: deletedPositions.length,
    deletedCronRuns: deletedCronRuns.length,
  }
}
