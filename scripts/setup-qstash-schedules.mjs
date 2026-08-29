// ---------------------------------------------------------------------------
// Tüm cron tetiklemelerini (önceden GitHub Actions + Vercel Cron'da olan)
// QStash schedule'larına taşıyan tek seferlik kurulum scripti.
//
// GitHub Actions'ın "en az bu aralıkla, garanti yok" schedule davranışı
// (yoğun saatlerde 30-60dk gecikebiliyor) yüzünden 5 dakikalık cron'lar
// güvenilir çalışmıyordu. QStash dakika hassasiyetinde garantili teslim +
// otomatik retry sağlıyor.
//
// Her schedule sabit bir scheduleId ile oluşturulur — bu script yeniden
// çalıştırılırsa (örn. secret değişince) aynı ID üzerine YAZAR, kopya
// schedule oluşturmaz (QStash'in "overwrite an existing schedule" davranışı).
//
// Kullanım:
//   set -a && source /vercel/share/.env.project && set +a
//   node scripts/setup-qstash-schedules.mjs
//
// Gerekli env değişkenleri: QSTASH_TOKEN, CRON_SECRET,
// VERCEL_AUTOMATION_BYPASS_SECRET, SITE_URL (örn. https://example.com)
// ---------------------------------------------------------------------------

const QSTASH_TOKEN = process.env.QSTASH_TOKEN
const CRON_SECRET = process.env.CRON_SECRET
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
// ÖNEMLİ — mutlaka "www." ile: apex domain (edcompanyofficial.com) www'ye
// 308 redirect yapıyor ve bu redirect takip edildiğinde Authorization
// header'ı düşüyor (401 Unauthorized). QStash redirect'i takip etmiyor,
// yani apex domain'e kurulan bir schedule ASLA başarılı olamaz (ya 308 alır
// ya da header'sız 401 alır). Bu yüzden schedule'lar doğrudan www'ye kurulu.
const SITE_URL = process.env.SITE_URL || "https://www.edcompanyofficial.com"

if (!QSTASH_TOKEN) {
  console.error("[qstash-setup] QSTASH_TOKEN tanımlı değil, çıkılıyor.")
  process.exit(1)
}

/**
 * @typedef {Object} ScheduleDef
 * @property {string} scheduleId
 * @property {string} cron
 * @property {string} path
 * @property {boolean} withBypass
 */

/** @type {ScheduleDef[]} */
const schedules = [
  {
    scheduleId: "live-fixture-notifications",
    // QStash'in izin verdiği en sık aralık 1 dakikadır (6 alanlı/saniye
    // bazlı cron ifadeleri DESTEKLENMİYOR — resmi dokümantasyon minimum
    // çözünürlüğün 1 dakika olduğunu belirtiyor). Route artık self-chaining
    // yapmıyor (bkz. route.ts), her çağrı TEK bir tarama yapıp döner,
    // sürekliliği QStash'in kendisi sağlıyor.
    cron: "* * * * *",
    path: "/api/cron/live-fixture-notifications",
    withBypass: false,
  },
  {
    scheduleId: "backfill-player-positions",
    cron: "*/5 * * * *",
    path: "/api/cron/backfill-player-positions",
    withBypass: true,
  },
  {
    scheduleId: "revalidate-sitemap",
    // 21:05 UTC = 00:05 TR (eski GitHub Actions workflow'uyla birebir aynı)
    cron: "5 21 * * *",
    path: "/api/cron/revalidate-sitemap",
    withBypass: false,
  },
  {
    scheduleId: "update-player-power",
    // eski vercel.json girdisiyle birebir aynı: her gün 00:00 UTC
    cron: "0 0 * * *",
    path: "/api/cron/update-player-power",
    withBypass: false,
  },
  {
    // AI tahmin sistemi: bekleyen tahminleri sonuçlanan maçlarla eşleştirip
    // adaptif model ağırlıklarını güncelleyen kontrol. Önceden SADECE sitede
    // açık bir sekmenin 30 saniyelik otomatik yenilemesiyle (istemci
    // tarafında) tetikleniyordu — kimse siteye bakmıyorsa hiç çalışmıyordu.
    // Bu schedule, ziyaretçiden bağımsız sunucu taraflı garanti sağlar.
    scheduleId: "predict-pending-check",
    cron: "*/10 * * * *",
    path: "/api/predict/pending-check",
    withBypass: true,
  },
]

async function createSchedule(def) {
  const destination = `${SITE_URL}${def.path}`
  const headers = {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    "Content-Type": "application/json",
    "Upstash-Cron": def.cron,
    "Upstash-Schedule-Id": def.scheduleId,
    "Upstash-Method": "GET",
  }
  if (CRON_SECRET) {
    headers["Upstash-Forward-Authorization"] = `Bearer ${CRON_SECRET}`
  }
  if (def.withBypass && BYPASS_SECRET) {
    headers["Upstash-Forward-x-vercel-protection-bypass"] = BYPASS_SECRET
  }

  const res = await fetch(`https://qstash.upstash.io/v2/schedules/${destination}`, {
    method: "POST",
    headers,
  })

  const body = await res.text()
  if (!res.ok) {
    throw new Error(`[qstash-setup] ${def.scheduleId} oluşturulamadı (HTTP ${res.status}): ${body}`)
  }
  console.log(`[qstash-setup] ${def.scheduleId} -> ${def.cron} (${destination}) OK`)
  return JSON.parse(body)
}

for (const def of schedules) {
  await createSchedule(def)
}

console.log("[qstash-setup] Tüm schedule'lar oluşturuldu. Upstash Console > QStash > Schedules üzerinden doğrulayabilirsin.")
