import { db } from "./db"
import { marketValueCronRun } from "./db/schema"
import { desc, eq } from "drizzle-orm"
import {
  prepareLeagueTeamSync,
  syncSingleTeam,
  SCRAPABLE_LEAGUE_IDS,
  type LeagueTeamProgress,
  type TeamSyncTask,
  type TeamSyncCounts,
} from "./market-value-sync"

// ---------------------------------------------------------------------------
// Haftalık 23 ligi zincirleme işleyen cron döngüsünün kalıcı durumu. Bu modül,
// hem ana cron route'u (app/api/cron/update-market-values) hem de kırılan
// zinciri devam ettiren watchdog route'u (app/api/cron/resume-market-values)
// hem de admin panelindeki manuel "devam ettir" butonu tarafından kullanılır
// — tek doğruluk kaynağı burası.
//
// ÖNEMLİ — zincirin granülerliği artık LİG değil, TAKIM'dır. Önceden her
// adım bir ligin TÜMÜNÜ (o ligdeki her takımın kadrosunu tek tek çekerek)
// işliyordu; büyük liglerde (~20 takım × takım başına birkaç istek) bu tek
// adım 60 saniyelik serverless zaman aşımını aşabiliyordu ve zincir bir
// ligin ORTASINDA kırılıyordu — bu kırılma hiçbir yerde tutulmadığı için o
// hafta kalan ligler hiç işlenmiyordu.
//
// Şimdi her lig iki alt-adıma bölünüyor:
//   1) "Hazırlık" adımı (bkz. prepareLeagueTeamSync) — SADECE o ligin takım
//      listesini çekip eşleştirir (tek round-trip çifti), sonucu bu satırın
//      leagueStatuses[i].teamProgress alanına yazar.
//   2) Takım adımları — teamProgress.tasks içindeki takımlar TEK TEK (her
//      çağrıda bir takım) işlenir, ilerleme (nextTeamIndex + sayaçlar) her
//      adımda bu satıra kaydedilir.
// Bir lig kaç takımdan oluşursa oluşsun, her HTTP çağrısı en fazla "bir
// hazırlık" veya "bir takım" kadar iş yapar — bu yüzden zincir artık bir
// ligin ortasında asla zaman aşımına uğramaz; kırılırsa (crash, ağ hatası)
// tam olarak hangi ligin hangi takımında kalındığı bu satırdan okunur.
// ---------------------------------------------------------------------------

/** Lig hazırlık adımının (takım listesini çekme) "geçici" hata sayılıp en fazla bu kadar denenmesi. */
const MAX_ATTEMPTS_PER_LEAGUE = 3
/** Lig hazırlık denemeleri arası bekleme. */
const RETRY_DELAYS_MS = [4000, 12000]
/** Tek bir takımın senkronu başarısız olursa en fazla bu kadar denenir — takım adımı zaten küçük olduğu için az deneme yeterli. */
const MAX_ATTEMPTS_PER_TEAM = 2
/** Takım denemeleri arası bekleme. */
const TEAM_RETRY_DELAY_MS = 3000
/** Bir "running" run'ın heartbeat'i bundan eskiyse zincir kırılmış sayılır ve devam ettirilebilir. */
export const STALE_HEARTBEAT_MS = 10 * 60 * 1000

/**
 * Zincirin kendi kendini tetikleyen self-fetch isteği (bkz. route.ts'lerdeki
 * triggerNextStep/triggerNextResumeStep) için zaman aşımı — bu YOKKEN, ağ
 * tarafında askıda kalan (ne başarılı ne hatalı biten) bir istek, after()'ı
 * maxDuration (300s) sonuna kadar bekletip fonksiyonu SESSİZCE (hiçbir catch
 * çalışmadan, hiçbir hata loglanmadan) zorla sonlandırırdı — zincir tam
 * olarak bu şekilde, rastgele bir noktada iz bırakmadan kırılıyordu.
 */
const SELF_FETCH_TIMEOUT_MS = 15_000
/** Self-fetch tetiklemesi başarısız/zaman aşımına uğrarsa en fazla bu kadar denenir. */
const SELF_FETCH_MAX_ATTEMPTS = 3
/** Self-fetch denemeleri arası bekleme. */
const SELF_FETCH_RETRY_DELAY_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Zincirin bir sonraki adımını tetikleyen self-fetch isteğini, zaman aşımı ve
 * yeniden deneme ile dayanıklı şekilde yapar. Tek doğruluk kaynağı burası —
 * hem ana cron route'u hem de watchdog route'u bunu kullanır, böylece askıda
 * kalan tek bir istek artık tüm zinciri sessizce öldüremez.
 */
export async function triggerChainContinuation(url: string, headers: Record<string, string>): Promise<void> {
  for (let attempt = 1; attempt <= SELF_FETCH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SELF_FETCH_TIMEOUT_MS)
    try {
      await fetch(url, { headers, signal: controller.signal })
      return
    } catch (err) {
      console.error(
        `[v0] Zincir devam tetiklemesi başarısız (deneme ${attempt}/${SELF_FETCH_MAX_ATTEMPTS}): ${url}`,
        err,
      )
      if (attempt < SELF_FETCH_MAX_ATTEMPTS) {
        await sleep(SELF_FETCH_RETRY_DELAY_MS)
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
  console.error(`[v0] Zincir devam tetiklemesi tüm denemelerden sonra başarısız oldu, zincir burada duracak: ${url}`)
}

export type LeagueRunStatus = "pending" | "success" | "failed"

export interface LeagueStatusEntry {
  leagueId: number
  status: LeagueRunStatus
  /** Lig hazırlık adımının kaç kez denendiği (takım bazlı denemeler burada sayılmaz). */
  attempts: number
  lastError: string | null
  updatedAt: string
  /**
   * Bu ligin takım bazlı zincirleme ilerlemesi. Lig "pending" durumundayken
   * (hazırlık yapılmış ama takımların hepsi işlenmemişken) dolu olur; lig
   * "success"/"failed" olarak tamamlandığında null'a döner (satırı şişirmemek
   * için).
   */
  teamProgress?: LeagueTeamProgress | null
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
    teamProgress: null,
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
 * Bir ligin takım listesini (hazırlık adımını), geçici hatalara karşı en
 * fazla MAX_ATTEMPTS_PER_LEAGUE kez deneyerek çeker. Bu adım hafif olduğu
 * için (tek round-trip çifti) kalıcı bir hata görülmesi nadir olmalı — ama
 * görülürse lig doğrudan "failed" işaretlenip zincir bir SONRAKI lige geçer.
 */
async function prepareLeagueWithRetries(
  leagueId: number,
  runStartedAt: Date,
): Promise<{ progress: LeagueTeamProgress | null; attempts: number; error: string | null }> {
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_LEAGUE; attempt++) {
    try {
      const progress = await prepareLeagueTeamSync(leagueId, runStartedAt)
      return { progress, attempts: attempt, error: null }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata"
      console.error(`[v0] Lig ${leagueId} takım listesi hazırlanırken hata (deneme ${attempt}/${MAX_ATTEMPTS_PER_LEAGUE}):`, err)
      const delay = RETRY_DELAYS_MS[attempt - 1]
      if (attempt < MAX_ATTEMPTS_PER_LEAGUE && delay) {
        await sleep(delay)
      }
    }
  }

  return { progress: null, attempts: MAX_ATTEMPTS_PER_LEAGUE, error: lastError }
}

/**
 * Tek bir takımı, geçici hatalara karşı en fazla MAX_ATTEMPTS_PER_TEAM kez
 * deneyerek işler. Tüm denemeler tükenirse bu takım "unmatched" sayılır ama
 * zincir DURMAZ — bir sonraki takıma (veya lige) geçilir; bu takımın kaydı
 * (lastSeenAt) hazırlık adımında zaten tazelenmiş olduğu için "hayalet"
 * sayılıp silinmez, sadece o hafta güncellenmemiş olur.
 */
async function syncSingleTeamWithRetries(
  leagueId: number,
  task: TeamSyncTask,
  season: number,
  runStartedAt: Date,
): Promise<ReturnType<typeof syncSingleTeam> extends Promise<infer T> ? T : never> {
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_TEAM; attempt++) {
    try {
      return await syncSingleTeam(leagueId, task, season, runStartedAt)
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bilinmeyen hata"
      console.error(
        `[v0] Takım ${task.match.apiFootballTeamId} (lig ${leagueId}) işlenirken hata (deneme ${attempt}/${MAX_ATTEMPTS_PER_TEAM}):`,
        err,
      )
      if (attempt < MAX_ATTEMPTS_PER_TEAM) {
        await sleep(TEAM_RETRY_DELAY_MS)
      }
    }
  }

  console.error(`[v0] Takım ${task.match.apiFootballTeamId} (lig ${leagueId}) tüm denemelerden sonra atlandı: ${lastError}`)
  return {
    teamsMatched: 0,
    teamsReview: 0,
    teamsUnmatched: 1,
    playersMatched: 0,
    playersReview: 0,
    playersUnmatched: 0,
  }
}

/** Bir ligi "success"/"failed" olarak tamamlar, sıradaki lige geçer ve satırı kaydeder. */
async function finalizeLeagueStep(
  run: CronRunRow,
  leagueIndex: number,
  outcome: { status: LeagueRunStatus; attempts: number; error: string | null },
): Promise<{ run: CronRunRow; done: boolean }> {
  const now = new Date()
  const nextLeagueStatuses = run.leagueStatuses.map((entry, i) =>
    i === leagueIndex
      ? {
          ...entry,
          status: outcome.status,
          attempts: outcome.attempts,
          lastError: outcome.error,
          updatedAt: now.toISOString(),
          teamProgress: null,
        }
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

/**
 * Döngünün TEK bir adımını işler. `run.currentLeagueIndex`'teki lig için:
 *
 * - Henüz takım listesi hazırlanmamışsa (teamProgress yok) SADECE hazırlık
 *   adımını yapar ve sonucu kaydeder (henüz hiçbir takım işlenmez).
 * - Takım listesi hazırsa ve işlenmemiş takım varsa SADECE bir takımı
 *   (yeniden deneyerek) işler ve ilerlemeyi kaydeder.
 * - Ligin tüm takımları işlenmişse ligi tamamlar ve sıradaki lige geçer.
 *
 * Her çağrı bu üç durumdan sadece BİRİNİ yapar — bu yüzden lig büyüklüğünden
 * bağımsız olarak her adım sabit ve küçük bir süre alır. Çağıran taraf (route
 * handler'lar), bir sonraki adımı tetiklemekten veya döngüyü tamamlamaktan
 * sorumludur.
 */
export async function processCronRunStep(run: CronRunRow): Promise<{ run: CronRunRow; done: boolean }> {
  const leagueIndex = run.currentLeagueIndex

  if (leagueIndex >= SCRAPABLE_LEAGUE_IDS.length) {
    return { run, done: true }
  }

  const leagueId = SCRAPABLE_LEAGUE_IDS[leagueIndex]
  const entry = run.leagueStatuses[leagueIndex]

  // 1) Bu lig için takım listesi henüz hazırlanmadıysa — hazırlık adımını yap.
  if (!entry.teamProgress) {
    const prep = await prepareLeagueWithRetries(leagueId, run.runStartedAt)

    if (!prep.progress) {
      // Lig seviyesinde kalıcı hata (takım listesi hiç çekilemedi) —
      // bu ligi "failed" işaretle, sıradaki lige geç.
      return finalizeLeagueStep(run, leagueIndex, { status: "failed", attempts: prep.attempts, error: prep.error })
    }

    const now = new Date()
    const nextLeagueStatuses = run.leagueStatuses.map((e, i) =>
      i === leagueIndex ? { ...e, attempts: prep.attempts, updatedAt: now.toISOString(), teamProgress: prep.progress } : e,
    )
    const [updated] = await db
      .update(marketValueCronRun)
      .set({ leagueStatuses: nextLeagueStatuses, heartbeatAt: now, updatedAt: now })
      .where(eq(marketValueCronRun.id, run.id))
      .returning()

    // Bu takımların hiçbiri henüz işlenmedi — bir sonraki adımda (bir sonraki
    // self-fetch'te) ilk takım işlenecek. Boş bir lig (tasks.length === 0)
    // olsa bile, tutarlılık için ligi burada kapatmıyoruz; bir sonraki adım
    // "işlenecek takım yok" durumunu görüp ligi hemen tamamlayacak.
    return { run: updated as CronRunRow, done: false }
  }

  const progress = entry.teamProgress

  // 2) Sırada işlenecek bir takım varsa — SADECE onu işle.
  if (progress.nextTeamIndex < progress.tasks.length) {
    const task = progress.tasks[progress.nextTeamIndex]
    const outcome = await syncSingleTeamWithRetries(leagueId, task, progress.season, run.runStartedAt)

    const now = new Date()
    const nextProgress: LeagueTeamProgress = {
      ...progress,
      nextTeamIndex: progress.nextTeamIndex + 1,
      teamsMatched: progress.teamsMatched + outcome.teamsMatched,
      teamsReview: progress.teamsReview + outcome.teamsReview,
      teamsUnmatched: progress.teamsUnmatched + outcome.teamsUnmatched,
      playersMatched: progress.playersMatched + outcome.playersMatched,
      playersReview: progress.playersReview + outcome.playersReview,
      playersUnmatched: progress.playersUnmatched + outcome.playersUnmatched,
    }
    const nextLeagueStatuses = run.leagueStatuses.map((e, i) =>
      i === leagueIndex ? { ...e, updatedAt: now.toISOString(), teamProgress: nextProgress } : e,
    )
    const [updated] = await db
      .update(marketValueCronRun)
      .set({ leagueStatuses: nextLeagueStatuses, heartbeatAt: now, updatedAt: now })
      .where(eq(marketValueCronRun.id, run.id))
      .returning()

    return { run: updated as CronRunRow, done: false }
  }

  // 3) Ligin tüm takımları işlendi — ligi "success" olarak tamamla, sıradaki lige geç.
  return finalizeLeagueStep(run, leagueIndex, { status: "success", attempts: entry.attempts, error: null })
}

/** Döngüyü "completed" olarak işaretler — cleanup adımından sonra çağrılır. */
export async function completeCronRun(runId: string): Promise<void> {
  await db
    .update(marketValueCronRun)
    .set({ status: "completed", heartbeatAt: new Date(), updatedAt: new Date() })
    .where(eq(marketValueCronRun.id, runId))
}
