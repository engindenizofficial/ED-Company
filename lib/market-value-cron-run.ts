import { db } from "./db"
import { marketValueCronRun } from "./db/schema"
import { desc, eq } from "drizzle-orm"
import { syncLeagueMarketValues, SCRAPABLE_LEAGUE_IDS } from "./market-value-sync"

// ---------------------------------------------------------------------------
// Haftalık 23 lig cron döngüsünün kalıcı durumu + tek bir ligi yeniden deneme
// mantığı. Bu modül, hem ana cron route'u (app/api/cron/update-market-values)
// hem de kırılan zinciri devam ettiren watchdog route'u (app/api/cron/
// resume-market-values) hem de admin panelindeki manuel "devam ettir"
// butonu tarafından kullanılır — tek doğruluk kaynağı burası.
//
// Neden gerekli: önceden zincir SADECE URL parametreleriyle taşınıyordu
// (after() -> fetch() -> after() -> ...). Bu zincir kırılırsa (serverless
// zaman aşımı, crash, ağ hatası) hangi ligin işlendiği/kaldığı hiçbir yerde
// tutulmuyordu ve o hafta kalan ligler hiç işlenmiyordu. Artık her adım bu
// tabloya (market_value_cron_run) yazılıyor.
// ---------------------------------------------------------------------------

/** Bir lig sync hatası "geçici" (rate limit, ağ, 503) sayılıp en fazla bu kadar denenir. */
const MAX_ATTEMPTS_PER_LEAGUE = 3
/** Denemeler arası bekleme — art arda aynı hatayı hemen tekrar üretmemek için. */
const RETRY_DELAYS_MS = [4000, 12000]
/** Bir "running" run'ın heartbeat'i bundan eskiyse zincir kırılmış sayılır ve devam ettirilebilir. */
export const STALE_HEARTBEAT_MS = 10 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type LeagueRunStatus = "pending" | "success" | "failed"

export interface LeagueStatusEntry {
  leagueId: number
  status: LeagueRunStatus
  attempts: number
  lastError: string | null
  updatedAt: string
}

export interface CronRunRow {
  id: string
  runStartedAt: Date
  status: "running" | "completed"
  currentLeagueIndex: number
  hadErrors: boolean
  leagueStatuses: LeagueStatusEntry[]
  heartbeatAt: Date
  createdAt: Date
  updatedAt: Date
}

function initialLeagueStatuses(): LeagueStatusEntry[] {
  const now = new Date().toISOString()
  return SCRAPABLE_LEAGUE_IDS.map((leagueId) => ({
    leagueId,
    status: "pending" as const,
    attempts: 0,
    lastError: null,
    updatedAt: now,
  }))
}

/** Yeni bir haftalık döngü satırı oluşturur — SADECE gerçek Vercel Cron tetiklemesinde (veya admin'in "yeni döngü başlat" isteğinde) çağrılmalı, watchdog bunu asla çağırmaz. */
export async function startNewCronRun(): Promise<CronRunRow> {
  const now = new Date()
  const id = `run-${now.getTime()}`

  const [row] = await db
    .insert(marketValueCronRun)
    .values({
      id,
      runStartedAt: now,
      status: "running",
      currentLeagueIndex: 0,
      hadErrors: false,
      leagueStatuses: initialLeagueStatuses(),
      heartbeatAt: now,
      updatedAt: now,
    })
    .returning()

  return row as CronRunRow
}

/** Hâlâ "running" durumunda olan (tamamlanmamış) en son döngüyü döndürür — varsa. */
export async function getActiveCronRun(): Promise<CronRunRow | null> {
  const rows = await db
    .select()
    .from(marketValueCronRun)
    .where(eq(marketValueCronRun.status, "running"))
    .orderBy(desc(marketValueCronRun.createdAt))
    .limit(1)
  return (rows[0] as CronRunRow) ?? null
}

/** Admin panelinde göstermek için: durumu ne olursa olsun en son döngü. */
export async function getLatestCronRun(): Promise<CronRunRow | null> {
  const rows = await db.select().from(marketValueCronRun).orderBy(desc(marketValueCronRun.createdAt)).limit(1)
  return (rows[0] as CronRunRow) ?? null
}

/** Bir "running" döngünün zincirinin kırılıp kırılmadığını (heartbeat eskimiş mi) kontrol eder. */
export function isCronRunStale(run: CronRunRow): boolean {
  return Date.now() - run.heartbeatAt.getTime() > STALE_HEARTBEAT_MS
}

/**
 * Tek bir ligi, geçici hatalara karşı en fazla MAX_ATTEMPTS_PER_LEAGUE kez
 * deneyerek işler. Kalıcı görünen bir hata (örn. IP engeli) tüm denemeleri
 * de tüketebilir — bu durumda lig "failed" olarak işaretlenip zincir bir
 * SONRAKI lige geçer (bu ligi sonsuza dek beklemez); ertesi haftaki tam
 * döngüde veya admin'in manuel "devam ettir" isteğinde yeniden denenir.
 */
async function runSingleLeagueWithRetries(
  leagueId: number,
  runStartedAt: Date,
): Promise<{ status: LeagueRunStatus; attempts: number; error: string | null }> {
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_LEAGUE; attempt++) {
    try {
      await syncLeagueMarketValues(leagueId, runStartedAt)
      return { status: "success", attempts: attempt, error: null }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata"
      console.error(`[v0] Lig ${leagueId} güncellenirken hata (deneme ${attempt}/${MAX_ATTEMPTS_PER_LEAGUE}):`, err)
      const delay = RETRY_DELAYS_MS[attempt - 1]
      if (attempt < MAX_ATTEMPTS_PER_LEAGUE && delay) {
        await sleep(delay)
      }
    }
  }

  return { status: "failed", attempts: MAX_ATTEMPTS_PER_LEAGUE, error: lastError }
}

/**
 * Döngünün TEK bir adımını işler: `run.currentLeagueIndex`'teki ligi (varsa
 * yeniden deneyerek) senkronlar, sonucu `market_value_cron_run` satırına
 * kalıcı olarak yazar ve güncellenmiş satırı döndürür. Çağıran taraf (route
 * handler'lar), bir sonraki adımı tetiklemekten veya döngüyü tamamlamaktan
 * sorumludur — bu fonksiyon sadece "bir lig işle + durumu kaydet" yapar.
 */
export async function processCronRunStep(run: CronRunRow): Promise<{ run: CronRunRow; done: boolean }> {
  const leagueIndex = run.currentLeagueIndex

  if (leagueIndex >= SCRAPABLE_LEAGUE_IDS.length) {
    return { run, done: true }
  }

  const leagueId = SCRAPABLE_LEAGUE_IDS[leagueIndex]
  const outcome = await runSingleLeagueWithRetries(leagueId, run.runStartedAt)

  const now = new Date()
  const nextLeagueStatuses = run.leagueStatuses.map((entry) =>
    entry.leagueId === leagueId
      ? { ...entry, status: outcome.status, attempts: outcome.attempts, lastError: outcome.error, updatedAt: now.toISOString() }
      : entry,
  )
  const hadErrors = run.hadErrors || outcome.status === "failed"
  const nextIndex = leagueIndex + 1

  const [updated] = await db
    .update(marketValueCronRun)
    .set({
      currentLeagueIndex: nextIndex,
      hadErrors,
      leagueStatuses: nextLeagueStatuses,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(marketValueCronRun.id, run.id))
    .returning()

  return { run: updated as CronRunRow, done: nextIndex >= SCRAPABLE_LEAGUE_IDS.length }
}

/** Döngüyü "completed" olarak işaretler — cleanup adımından sonra çağrılır. */
export async function completeCronRun(runId: string): Promise<void> {
  await db
    .update(marketValueCronRun)
    .set({ status: "completed", heartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(marketValueCronRun.id, runId))
}
