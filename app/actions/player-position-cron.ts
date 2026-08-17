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
 * Bir "running" satırın ne kadar süre sonra "zincir kırılmış" sayılacağı.
 * Her satır kendi maxDuration (300s) penceresi içinde ya "completed" olur ya
 * da bir sonraki batch'i (yeni bir satırla) tetikler — bu sürenin çok
 * üzerinde hâlâ "running" kalması (yeni satır da gelmemesi) self-fetch'in
 * veya sunucunun bir yerde durduğunu gösterir.
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
  const isStale = status === "running" && Date.now() - run.runStartedAt.getTime() > STALE_RUN_MS

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
    const isStale = Date.now() - latest.runStartedAt.getTime() > STALE_RUN_MS
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

  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
  const url = `${base}/api/cron/backfill-player-positions`

  // Piyasa değeri action'larıyla AYNI desen — `after()` ile fire-and-forget.
  // Bu callback, yanıt gönderildikten SONRA ama fonksiyon dondurulmadan ÖNCE
  // çalıştırılması garanti edilir; action anında "tetiklendi" döner, gerçek
  // backfill arka planda (route'un kendi 300s maxDuration'ı içinde) devam eder.
  //
  // ÖNEMLİ — özel (varsayılandan uzun) bir timeout veriyoruz, route.ts'teki
  // SELF_FETCH_TIMEOUT_FOR_THIS_ROUTE_MS ile TAM OLARAK AYNI değer (60s) —
  // bu iki sayı senkronize kalmalı, aksi halde aynı çoklanma felaketi
  // tekrar oluşabilir (bkz. route.ts'teki detaylı worst-case hesabı). Bu
  // route'un varsayılan 15s'lik self-fetch zaman aşımından çok daha uzun
  // sürebilecek tek-oyuncu adımları olduğu için (bkz. route.ts BATCH_SIZE
  // yorumu) — uyuşmazlık, aynı adım için sunucuda çalışan bir isteği
  // "başarısız" sayıp paralel bir ikincisini başlatan çoklanma felaketine
  // yol açar.
  after(() => triggerChainContinuation(url, headersInit, 60_000))

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
