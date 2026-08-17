import { after } from "next/server"
import { cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"
import {
  startNewCronRun,
  getActiveCronRun,
  processCronRunStep,
  completeCronRun,
  isCronRunStale,
  runMatchesCurrentLeagueList,
  triggerChainContinuation,
  type CronRunRow,
} from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// ÖNEMLİ — bu route ÖNCEDEN vercel.json'daki bir Vercel Cron zamanlamasıyla
// (her Çarşamba 03:00 TR) otomatik tetikleniyordu. Bu otomatik zamanlama
// KALDIRILDI — artık bu endpoint SADECE admin panelindeki "Şimdi Tara"
// butonuyla (bkz. app/actions/market-value-cron.ts triggerMarketValueScanNow)
// manuel olarak tetiklenir. Route'un kendisi (zincirleme, devam ettirme,
// stale/broken tespiti) hiç değişmedi — sadece dışarıdan otomatik çağıran
// zamanlayıcı yok artık.
//
// 24 lig tek bir istekte işlenmiyor (Transfermarkt + API-Football'a yüzlerce
// istek gidiyor, serverless zaman aşımı riski var). Bunun yerine bu route
// kendi kendini zincirler: her çağrı SADECE bir ligi işler, sonra bir sonraki
// ligi tetikleyip (after() ile, cevabı bekletmeden) hemen yanıt döner.
//
// ÖNEMLİ — durum artık URL parametrelerinde değil, DB'de (market_value_cron_run)
// kalıcı tutulur (bkz. lib/market-value-cron-run.ts). Her adımda (her lig
// işlendiğinde) o satır güncellenir: hangi ligde kalındığı, kaç kez denendiği,
// son hatası. Zincir bir yerde kesilirse (crash, zaman aşımı, ağ hatası) bu
// satır tam olarak nerede kalındığını gösterir. Devam ettirme otomatik
// gerçekleşmez — admin panelindeki "Devam Ettir" butonu (bkz. app/api/cron/
// resume-market-values) manuel olarak tetiklenmelidir.
//
// Ayrıca her lig, geçici hatalara (rate limit, 503, ağ) karşı tek istek
// içinde birkaç kez yeniden denenir (bkz. runSingleLeagueWithRetries).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ÖNEMLİ — zincir eskiden HER HTTP çağrısında SADECE BİR takım işleyip kendi
// kendini yeniden tetikliyordu (self-fetch). ~24 lig × ortalama birkaç
// takım = yüzlerce ayrı self-fetch demekti; bunlardan biri engellenirse
// (örn. Vercel Deployment Protection) ya da ağ hatası alırsa zincir tam
// olarak orada kırılıyordu. Şimdi her çağrı, aşağıdaki zaman bütçesi
// dolana kadar (veya döngü tamamlanana kadar) ARKA ARKAYA birden çok adım
// işler — bu, gereken self-fetch sayısını (ve dolayısıyla kırılma riskini)
// yüzlerce yerine tek haneli sayılara indirir.
const STEP_BUDGET_MS = 260_000

// ÖNEMLİ — BULUNAN GERÇEK KÖK NEDEN (admin "Şimdi Tara"ya basınca hiçbir şey
// olmuyor gibi görünmesi): Bu route'un tek bir çağrısı, yukarıdaki
// STEP_BUDGET_MS boyunca (260 saniyeye kadar) SENKRON olarak birçok takım/lig
// işleyip ANCAK İŞİ BİTİRDİKTEN SONRA yanıt dönüyordu. Zinciri bir sonraki
// adıma taşıyan self-fetch (triggerChainContinuation, bkz.
// lib/market-value-cron-run.ts) ise bu yanıtı sadece 15 saniye (
// SELF_FETCH_TIMEOUT_MS) bekliyordu — yani callee'nin normal, TASARLANMIŞ
// çalışma süresi (260s) her zaman bu 15 saniyelik zaman aşımından
// UZUNDU. Sonuç: her adımda self-fetch "başarısız" sayılıp 2-3 kez tekrar
// gönderiliyordu; her tekrar, hâlâ çalışmakta olan (heartbeat'i taze
// olduğu için "stale" sayılmayan) AYNI döngü satırı üzerinde YENİ bir
// eşzamanlı (concurrent) işleyici başlatıyordu — bu da birbirinin
// ilerlemesini ezen/bozan yarış durumlarına (race condition) yol açıyordu.
// Zincir dışarıdan "tetiklendi" görünse de gerçek ilerleme kesintiye
// uğruyor/bozuluyordu.
//
// ÇÖZÜM: Bu route artık ağır işi (yukarıdaki do-while döngüsünü) yapmadan
// ÖNCE hemen (milisaniyeler içinde) bir "başladı" yanıtı dönüyor; asıl
// tarama işi kendi after() callback'i İÇİNDE yapılıyor (bkz. GET handler'ı
// altındaki runBatchAndContinue). Böylece zinciri tetikleyen taraf (admin'in
// action'ı veya önceki self-fetch) yanıtı saniyeler içinde alır, 15 saniyelik
// zaman aşımına hiç yaklaşmaz — gereksiz tekrar tetikleme ve çakışan
// eşzamanlı işleyiciler artık oluşmaz.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  // Üretime alınmadan önce CRON_SECRET eklenmesi önerilir.
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function triggerNextStep(request: Request, runId: string): Promise<void> {
  const url = new URL(request.url)
  // "runId" parametresi bu çağrının zincirin İÇİNDEN geldiğini işaretler —
  // bu sayede aşağıdaki GET handler'ı, az önce kendisinin tazelediği
  // heartbeat'e bakıp yanlışlıkla "zaten çalışıyor, dokunma" demez (bkz.
  // GET içindeki isInternalContinuation kontrolü).
  url.searchParams.set("runId", runId)

  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`

  // Vercel Authentication (Deployment Protection) tüm ".vercel.app"
  // URL'lerini korumaya alıyor. Vercel Cron'un İLK çağrısı bu korumayı
  // otomatik atlar, ama bu self-fetch (zincirin kendi kendini tetiklemesi)
  // normal bir dış istek gibi görülür ve engellenir. Bunu aşmak için
  // Protection Bypass for Automation secret'ı header olarak eklenir.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  // Artık callee (bu route'un kendisi) hemen bir "başladı" yanıtı dönüyor
  // (bkz. runBatchAndContinue) — bu yüzden 15 saniyelik zaman aşımı burada
  // gerçekten yeterli, çünkü artık 260 saniyelik gerçek işi BEKLEMİYORUZ.
  await triggerChainContinuation(url.toString(), headers)
}

/**
 * Asıl ağır işi (zaman bütçesi dolana/döngü tamamlanana kadar art arda adım
 * işleme + tamamlanınca cleanup) yapar ve ardından bir sonraki adımı
 * tetikler. GET handler'ı yanıtı döndürdükten SONRA after() içinde çağrılır
 * — böylece bu route'a self-fetch yapan taraf, bu fonksiyonun bitmesini
 * BEKLEMEK ZORUNDA KALMAZ (bkz. yukarıdaki kök neden açıklaması).
 */
async function runBatchAndContinue(request: Request, initialRun: CronRunRow): Promise<void> {
  const startedAt = Date.now()
  let updatedRun = initialRun
  let done = false

  do {
    const step = await processCronRunStep(updatedRun)
    updatedRun = step.run
    done = step.done
  } while (!done && Date.now() - startedAt < STEP_BUDGET_MS)

  if (done) {
    const hadErrors = updatedRun.hadErrors
    await cleanupStaleMarketValueRows(updatedRun.runStartedAt, hadErrors)
    await completeCronRun(updatedRun.id)
    return
  }

  await triggerNextStep(request, updatedRun.id)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const continuationRunId = searchParams.get("runId")

  let run: CronRunRow | null

  if (continuationRunId) {
    // Zincirin içinden gelen bir devam çağrısı — bu isteği BİZ ürettik
    // (triggerNextStep), dolayısıyla heartbeat'in "az önce" güncellenmiş
    // olması normaldir; stale/already-running kontrolüne gerek yok, doğrudan
    // aynı döngüye devam et.
    run = await getActiveCronRun()
    if (!run || run.id !== continuationRunId) {
      // Döngü bu arada başka bir yoldan (örn. admin panelinden manuel devam
      // ettirme) tamamlanmış olabilir.
      return Response.json({ done: true, message: "Döngü zaten tamamlanmış." })
    }
  } else {
    // Dıştan gelen tetikleme: admin'in "Şimdi Tara" isteği (artık otomatik bir
    // haftalık zamanlama yok). Devam eden bir "running" döngü varsa ona devam
    // edilir; yoksa yeni bir döngü başlatılır.
    const active = await getActiveCronRun()

    if (active && !runMatchesCurrentLeagueList(active)) {
      // Bu satır, lig listesi (FEATURED_LEAGUE_IDS) değişmeden ÖNCE
      // başlatılmış — eski leagueStatuses artık koddaki güncel listeyle
      // index bazında eşleşmiyor (bkz. runMatchesCurrentLeagueList). Devam
      // ettirmeye çalışmak yanlış ligin verisini yazabilir veya zinciri
      // sessizce kırabilir. Bu eski satırı "tamamlandı" (hatalı) işaretleyip
      // güncel listeyle sıfırdan bir döngü başlatıyoruz.
      console.warn(
        `[v0] Aktif döngü (${active.id}) güncel lig listesiyle uyuşmuyor (lig sayısı/sırası değişti) — eskisi kapatılıp yeni döngü başlatılıyor.`,
      )
      await completeCronRun(active.id)
      run = await startNewCronRun()
    } else if (!active) {
      run = await startNewCronRun()
    } else if (isCronRunStale(active)) {
      // Zincir kırılmıştı (heartbeat eskimiş) — admin panelindeki "Devam Ettir"
      // veya bu route'a atılan bir sonraki manuel "Şimdi Tara" isteği aynı
      // durumu görüp doğrudan devam ettirir.
      console.log(`[v0] Kırılmış döngü (${active.id}) bu istekle devam ettiriliyor.`)
      run = active
    } else {
      // Aktif ve sağlıklı ilerleyen bir döngü zaten var — ikinci bir tanesini
      // başlatıp aynı ligleri iki kez taramamak için hiçbir şey yapma.
      return Response.json({ alreadyRunning: true, runId: active.id, currentLeagueIndex: active.currentLeagueIndex })
    }
  }

  // Bu noktada `run` yukarıdaki her koldan non-null atanmış olur (aksi
  // haller zaten erken return ile bitmiştir) — closure içindeki tip
  // daralmasını garanti etmek için sabit bir değişkene alıyoruz.
  const activeRun: CronRunRow = run

  // ÖNEMLİ — asıl ağır iş (art arda adım işleme, tamamlanınca cleanup, bir
  // sonraki adımı tetikleme) burada SENKRON yapılmıyor. Bu isteği tetikleyen
  // taraf (admin'in "Şimdi Tara" action'ı veya zincirin önceki halkası) bu
  // yanıtı sadece kısa bir süre bekliyor (bkz. triggerChainContinuation) —
  // gerçek iş yanıt döndükten SONRA after() içinde yapılır ki çağıran taraf
  // asla zaman aşımına uğramasın (bkz. dosya başındaki kök neden açıklaması).
  after(() => runBatchAndContinue(request, activeRun))

  return Response.json({
    started: true,
    runId: activeRun.id,
    currentLeagueIndex: activeRun.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    hadErrors: activeRun.hadErrors,
  })
}
