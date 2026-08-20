import { cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import {
  startNewCronRun,
  getActiveCronRun,
  processCronRunStep,
  completeCronRun,
  runMatchesCurrentLeagueList,
  type CronRunRow,
} from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// ÖNEMLİ GEÇMİŞ — bu route ÖNCEDEN kendi kendini `after()` + self-fetch ile
// tetikleyerek (bir adım/lig bitince aynı URL'e kendi sunucusundan tekrar
// istek göndererek) 24 ligin TÜMÜNÜ tek bir "Şimdi Tara" tıklamasıyla uçtan
// uca bitirmeye çalışıyordu. Bu YAPISAL olarak asla güvenilir çalışamazdı:
// Vercel platformu, bir fonksiyonun kendini ZİNCİRLEME şekilde çağırmasına
// (self-fetch → o da self-fetch → ...) SABİT bir 5 sıçrama (hop) sınırı
// koyuyor — maliyet/kötüye kullanım koruması olarak, ve bu hiçbir
// kod/timeout/header değişikliğiyle aşılamıyor. 24 lig × takım bazlı adımlar
// STEP_BUDGET_MS içinde bitmeyince zincir birkaç self-fetch sonra HER ZAMAN
// "HTTP 508 Loop Detected / INFINITE_LOOP_DETECTED" ile platform tarafından
// kesiliyordu (tıpkı app/api/cron/backfill-player-positions'ta yaşanan ve
// oradaki dosya başı açıklamada detaylandırılan sorunun aynısı).
//
// ÇÖZÜM: bu route artık kendini HİÇ tetiklemiyor — SADECE gelen TEK bir GET
// isteğine karşılık, zaman bütçesi (STEP_BUDGET_MS) dolana veya döngü
// tamamlanana kadar art arda adım işler, sonra döner. Zincirin "devamını"
// DIŞARIDAN (Vercel'in kendi fonksiyon-çağırma ağının dışından) gelen
// periyodik bir zamanlayıcı sağlıyor: QStash (bkz.
// scripts/setup-qstash-schedules.mjs, scheduleId: "update-market-values",
// 5 dakikada bir). Dışarıdan gelen her istek platform için "hop 0" /
// tamamen bağımsız bir çağrı olduğu için, kaç yüz kez çağrılırsa çağrılsın
// 5-sıçrama sınırına ASLA dokunulmuyor.
//
// Durumsuz DEĞİL ama kalıcı ilerleme: durum URL parametrelerinde değil,
// DB'de (market_value_cron_run, bkz. lib/market-value-cron-run.ts) tutulur.
// Zamanlayıcı bir çağrıyı atlarsa ya da bir çağrı ortada kesilirse, bir
// sonraki çağrı DB'deki currentLeagueIndex/teamProgress'ten otomatik devam
// eder — ekstra bir "resume" endpoint'ine gerek yoktur (eskiden
// app/api/cron/resume-market-values vardı, bu route'un kendisi artık aynı
// işi yaptığı için kaldırıldı).
//
// Ayrıca her lig, geçici hatalara (rate limit, 503, ağ) karşı tek istek
// içinde birkaç kez yeniden denenir (bkz. lib/market-value-cron-run.ts
// prepareLeagueWithRetries / syncSingleTeamWithRetries).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
// Bu projede Fluid Compute aktif, bu sayede Hobby planında da fonksiyon
// süresi 300 saniyeye kadar çıkabiliyor.
export const maxDuration = 300

// Her çağrı, bu süre dolana ya da döngü tamamlanana kadar art arda lig/takım
// adımı işler. Dış zamanlayıcı (QStash) bu route'u ne sıklıkla çağırırsa,
// toplam ilerleme hızı da o kadar olur. maxDuration'dan (300s) biraz pay
// bırakır (DB yazma/cleanup gibi ek işler için).
const STEP_BUDGET_MS = 260_000

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  // Üretime alınmadan önce CRON_SECRET eklenmesi önerilir.
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

// ÖNEMLİ — bu header'ı SADECE admin panelindeki "Şimdi Tara" butonu
// (triggerMarketValueScanNow, app/actions/market-value-cron.ts) gönderir.
// Dış zamanlayıcı (QStash schedule, bkz. scripts/setup-qstash-schedules.mjs)
// bunu HİÇ göndermez. Bunun sebebi: haftalık taramanın admin taramayı kendisi
// başlatana kadar arka planda kendiliğinden (ilk kez) başlamasını
// istemiyoruz — dış zamanlayıcı sadece ZATEN "running" durumda olan bir
// koşuyu devam ettirebilir, YENİ bir koşu açamaz. Admin "Şimdi Tara"ya
// bastıktan sonra dış zamanlayıcı o koşuyu bitirene kadar otomatik ilerletir;
// koşu biterse (completed) bir dahaki "Şimdi Tara"ya kadar hiçbir şey yapmaz.
const MANUAL_TRIGGER_HEADER = "x-market-value-manual-trigger"

function isManualTrigger(request: Request): boolean {
  return request.headers.get(MANUAL_TRIGGER_HEADER) === "1"
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const active = await getActiveCronRun()

  let run: CronRunRow

  if (active && runMatchesCurrentLeagueList(active)) {
    // Devam eden (ya da sağlıklı ilerleyen) bir döngü varsa onu HER ZAMAN
    // devam ettiriyoruz — çağrı admin'in "Şimdi Tara" butonundan mı yoksa
    // dış zamanlayıcıdan mı geldiği önemli değil. "Kırık zincir" kavramı
    // artık gerekli değil: ilerleme tamamen bu route'a yapılan dış
    // çağrılara bağlı olduğu için her çağrı basitçe bir sonraki adımı işler.
    run = active
  } else {
    if (active && !runMatchesCurrentLeagueList(active)) {
      // Bu satır, lig listesi (SCRAPABLE_LEAGUE_IDS) değişmeden ÖNCE
      // başlatılmış — eski leagueStatuses artık koddaki güncel listeyle
      // index bazında eşleşmiyor (bkz. runMatchesCurrentLeagueList). Devam
      // ettirmeye çalışmak yanlış ligin verisini yazabilir. Bu eski satırı
      // "tamamlandı" (hatalı) işaretleyip güncel listeyle sıfırdan bir
      // döngü başlatıyoruz (SADECE admin manuel tetiklerse, aşağıda).
      console.warn(
        `[v0] Aktif döngü (${active.id}) güncel lig listesiyle uyuşmuyor (lig sayısı/sırası değişti) — eskisi kapatılıyor.`,
      )
      await completeCronRun(active.id)
    }

    if (!isManualTrigger(request)) {
      // Dış zamanlayıcıdan gelen çağrı ve devam ettirilecek bir koşu yok —
      // YENİ bir koşu AÇMIYORUZ. Sadece admin'in kendisi bir tarama
      // başlatabilir; aksi halde QStash kullanıcı hiç dokunmasa da her 5
      // dakikada bir kendiliğinden yeni bir haftalık tarama başlatırdı.
      return Response.json({ done: false, skipped: "notStartedByAdmin" })
    }

    run = await startNewCronRun()
  }

  // Zaman bütçesi dolana ya da döngü tamamlanana kadar arka arkaya adım işle.
  const startedAt = Date.now()
  let updatedRun = run
  let done = false

  do {
    const step = await processCronRunStep(updatedRun)
    updatedRun = step.run
    done = step.done
  } while (!done && Date.now() - startedAt < STEP_BUDGET_MS)

  if (done) {
    // Zincirdeki son adım: tüm ligler işlendi (veya en fazla deneme sayısı
    // tüketilerek "failed" işaretlendi). hadErrors=false ise artık hiçbir
    // taranan ligde/kadroda görünmeyen "hayalet" kayıtları temizle.
    const cleanup = await cleanupStaleMarketValueRows(updatedRun.runStartedAt, updatedRun.hadErrors)
    await completeCronRun(updatedRun.id)
    return Response.json({
      done: true,
      message: "Tüm ligler işlendi.",
      runId: updatedRun.id,
      hadErrors: updatedRun.hadErrors,
      leagueStatuses: updatedRun.leagueStatuses,
      cleanup,
    })
  }

  // ÖNEMLİ — burada BİLİNÇLİ olarak bir sonraki adımı KENDİ KENDİMİZE
  // tetiklemiyoruz (bkz. dosya başı açıklaması). `done` false ise, run
  // satırı "running" olarak kalır ve dış zamanlayıcının (QStash) bir
  // sonraki periyodik çağrısı bu route'u tekrar çağırarak devam ettirir.

  return Response.json({
    done: false,
    runId: updatedRun.id,
    currentLeagueIndex: updatedRun.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    hadErrors: updatedRun.hadErrors,
  })
}
