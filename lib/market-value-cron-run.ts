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
// Haftalık 24 ligi zincirleme işleyen cron döngüsünün kalıcı durumu. Bu modül,
// hem ana cron route'u (app/api/cron/update-market-values) hem de kırılan
// zinciri devam ettiren route'u (app/api/cron/resume-market-values) hem de
// admin panelindeki manuel "devam ettir" butonu tarafından kullanılır — tek
// doğruluk kaynağı burası.
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
 * hem ana cron route'u hem de resume route'u bunu kullanır, böylece askıda
 * kalan tek bir istek artık tüm zinciri sessizce öldüremez.
 *
 * `timeoutMs` (varsayılan 15s, market-value zinciri için doğru): her adımın
 * gerçek worst-case süresini KESİNLİKLE aşmalı. AKSİ HALDE şu çoklanma
 * felaketi oluşur — bu tam olarak mevki (player-position) zincirinde
 * yaşandı: bir adım sunucuda 15s'den uzun sürerse (örn. Transfermarkt
 * retry'ları yüzünden), self-fetch "zaman aşımı" deyip isteği TEKRAR
 * gönderir; ama sunucudaki ilk istek İPTAL OLMAZ, arka planda çalışmaya
 * devam eder. Artık AYNI adım için 2 paralel istek Transfermarkt'a gidiyor
 * olur — bu da bot korumasını daha çok tetikler, adımları daha da
 * yavaşlatır, 15s'yi yine aşar, 3. bir istek başlar... Sonsuz çoğalan,
 * birbirini yavaşlatan paralel zincirler oluşur. Çağıran taraf bu yüzden
 * kendi adımının gerçek worst-case süresine göre daha uzun bir `timeoutMs`
 * vermelidir.
 */
export async function triggerChainContinuation(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = SELF_FETCH_TIMEOUT_MS,
): Promise<void> {
  for (let attempt = 1; attempt <= SELF_FETCH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { headers, signal: controller.signal })
      if (!response.ok) {
        // ÖNEMLİ — daha önce burada sadece fetch'in ağ hatası fırlatması
        // yakalanıyordu; bir 401 (örn. Vercel Deployment Protection'ın
        // self-fetch'i engellemesi) ya da 5xx yanıtı "başarılı" sayılıp
        // zincir hiçbir hata izi bırakmadan sessizce duruyordu. Şimdi
        // başarısız durum kodları da hata olarak ele alınıp yeniden denenir
        // ve loglanır.
        const body = await response.text().catch(() => "")
        throw new Error(`HTTP ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`)
      }
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

/**
 * Adım süresi UZUN olabilecek zincirler (örn. player-position backfill,
 * bkz. app/api/cron/backfill-player-positions) için: bir sonraki adımı,
 * TAM YANITINI BEKLEMEDEN tetikler.
 *
 * NEDEN triggerChainContinuation BURADA KULLANILAMAZ: o fonksiyon, sonraki
 * adımın TAM yanıtını (timeoutMs'e kadar) bekler. Adım KISA sürdüğünde
 * (market-value zinciri — saniyeler) bu güvenlidir. Ama adım UZUN
 * sürdüğünde (player-position — 190-237s), bu bekleme çağıranın KENDİ
 * after() bloğunun, kendi invocation'ının maxDuration'ından (300s) geriye
 * kalan bütçesi içinde sıkışır: çağıran zaten kendi batch'ini 190-237s'de
 * işlemişse, after() için sadece ~60-100s kalır — ama triggerChainContinuation
 * 270s'ye kadar bekler. Bu süre bitmeden invocation platform tarafından
 * sert şekilde öldürülürse, HENÜZ TAM GÖNDERİLMEMİŞ olan self-fetch isteği
 * de yarıda kesilebilir; bir sonraki adım hiç başlamaz ve zincir sessizce,
 * iz bırakmadan kırılır — admin panelinin defalarca gösterdiği "Zincir
 * kırıldı" durumunun kök nedeni tam olarak buydu (kullanıcı siteden çıkıp
 * geri girdiğinde zincirin kırılmış görünmesi, aslında ayrılmasıyla
 * ilgisizdi — bu darboğaz her adım geçişinde oluşuyordu, sadece fark
 * edilmesi zaman aldı).
 *
 * Çözüm: isteği gönder, SADECE hızlı bir hatayı (401, DNS, bağlantı reddi)
 * yakalayacak kısa bir pencere (confirmTimeoutMs) bekle, sonra — isteği
 * İPTAL ETMEDEN — dön. Hızlı bir hata görülürse birkaç kez (maxQuickRetries)
 * kısa aralıklarla yeniden dener; pencere içinde hiçbir şey olmazsa
 * (beklenen durum — downstream kendi uzun işine başlamıştır) sessizce
 * başarı sayar.
 *
 * ÖNEMLİ — bu fonksiyon, TÜM hızlı denemeler KESİN bir hatayla (401, 5xx,
 * ağ hatası) sonuçlanırsa artık bir Error FIRLATIYOR (öncesinde sadece
 * console.error basıp sessizce dönüyordu). Çağıran taraf bunu yakalayıp
 * run satırını "failed" + gerçek hata mesajıyla işaretleyebilir — böylece
 * admin paneli en azından GERÇEK bir sebep gösterebilir, "stale" (6 dakika
 * heartbeat yok) genel uyarısı yerine. Beklenen "hiç yanıt gelmedi, downstream
 * kendi işine başladı" durumu (outcome.settled === false) HÂLÂ başarı
 * sayılır ve fırlatma yapılmaz — bu, KESİN bir hatayı, "henüz bilmiyoruz"
 * durumundan ayırt eder.
 */
export async function fireChainStepWithoutAwaitingResponse(
  url: string,
  headers: Record<string, string>,
  confirmTimeoutMs = 8_000,
  maxQuickRetries = 2,
): Promise<void> {
  let lastConfirmedError: string | null = null

  for (let attempt = 1; attempt <= maxQuickRetries + 1; attempt++) {
    try {
      const outcome = await Promise.race([
        fetch(url, { headers }).then((res) => ({ settled: true as const, res })),
        sleep(confirmTimeoutMs).then(() => ({ settled: false as const, res: null })),
      ])

      if (!outcome.settled) {
        // Beklenen durum: downstream kendi uzun batch'ine başladı, yanıt bu
        // kısa pencerede dönmedi. İstek zaten ağa gönderildi, daha fazla
        // beklemeye gerek yok.
        return
      }

      if (outcome.res.ok) return

      const body = await outcome.res.text().catch(() => "")
      lastConfirmedError = `HTTP ${outcome.res.status} ${outcome.res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`
      console.error(
        `[v0] Zincir tetiklemesi hızlı bir hata döndürdü (HTTP ${outcome.res.status}, deneme ${attempt}/${maxQuickRetries + 1}): ${body.slice(0, 300)}`,
      )
    } catch (err) {
      lastConfirmedError = err instanceof Error ? err.message : String(err)
      console.error(
        `[v0] Zincir tetiklemesi ağ hatasıyla başarısız oldu (deneme ${attempt}/${maxQuickRetries + 1}):`,
        err,
      )
    }

    if (attempt <= maxQuickRetries) {
      await sleep(2_000)
    }
  }
  console.error(`[v0] Zincir tetiklemesi tüm hızlı denemelerden sonra başarısız oldu, zincir burada duracak: ${url}`)
  throw new Error(lastConfirmedError ?? "Zincir tetiklemesi tüm hızlı denemelerden sonra başarısız oldu")
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

/** Yeni bir haftalık döngü satırı oluşturur — SADECE gerçek Vercel Cron tetiklemesinde (veya admin'in "yeni döngü başlat" isteğinde) çağrılmalı, resume route'u bunu asla çağırmaz. */
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
 * Bir döngü satırının `leagueStatuses`'ı, koddaki GÜNCEL SCRAPABLE_LEAGUE_IDS
 * listesiyle (sıra ve sayı olarak) hâlâ eşleşiyor mu kontrol eder.
 *
 * ÖNEMLİ — bu kontrol OLMADAN şu senaryo zinciri sessizce (veya bir crash'le)
 * kırabiliyordu: bir döngü satırı "running" durumdayken (örn. bir lig
 * eklenip/kaldırılıp/sıra değiştirilip) deploy edilirse, DB'deki eski
 * leagueStatuses artık kod içindeki YENİ SCRAPABLE_LEAGUE_IDS ile aynı
 * index'te aynı ligi işaret etmez. processCronRunStep, `run.leagueStatuses[i]`
 * (eski, kısa/kaymış dizi) ile `SCRAPABLE_LEAGUE_IDS[i]` (yeni liste) arasında
 * eşleşmeyen bir lig id'siyle devam ederdi — yanlış ligin verisini yanlış
 * lig id'sine yazabilir, ya da eski dizinin sonuna gelince (`entry`
 * undefined) `entry.teamProgress` okunurken throw ederdi. Bu throw,
 * `after()` ile bir sonraki adımı tetiklemeden ÖNCE gerçekleştiği için
 * heartbeat bir daha güncellenmez ve döngü "zincir kırıldı" olarak donar.
 *
 * Çağıran taraf (route handler'ları), bu fonksiyon false dönerse mevcut
 * satırı devam ettirmek YERİNE tamamlanmış işaretleyip yeni bir döngü
 * başlatmalıdır.
 */
export function runMatchesCurrentLeagueList(run: CronRunRow): boolean {
  if (run.leagueStatuses.length !== SCRAPABLE_LEAGUE_IDS.length) return false
  return run.leagueStatuses.every((entry, i) => entry.leagueId === SCRAPABLE_LEAGUE_IDS[i])
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

  // Son çare koruması — bkz. runMatchesCurrentLeagueList açıklaması. Normalde
  // çağıran taraf (route.ts) bu satıra hiç gelmeden mismatch'i tespit edip
  // yeni bir döngü başlatmalı; ama olur da buraya kadar gelinirse (örn. eski
  // bir kod yolundan), `entry` undefined olabilir veya yanlış ligi işaret
  // edebilir — bu durumda sessizce throw etmek (ve zinciri "kırılmış" bırakmak)
  // yerine döngüyü burada güvenle sonlandırıyoruz.
  if (!entry || entry.leagueId !== leagueId) {
    console.error(
      `[v0] Döngü ${run.id} lig listesiyle uyuşmuyor (index ${leagueIndex}, beklenen lig ${leagueId}, kayıtlı: ${entry?.leagueId ?? "yok"}) — döngü güvenlik amacıyla burada sonlandırılıyor.`,
    )
    return { run, done: true }
  }

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
