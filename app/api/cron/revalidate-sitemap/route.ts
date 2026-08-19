import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Bu route günde bir kez QStash tarafından tetikleniyor (bkz.
// scripts/setup-qstash-schedules.mjs, scheduleId: "revalidate-sitemap" —
// "5 21 * * *" = 00:05 TR). Eskiden GitHub Actions kullanılıyordu (bkz.
// .github/workflows/revalidate-sitemap.yml), GitHub'ın schedule
// tetiklemelerinin garanti bir zamanlama sunmaması sonrası QStash'e taşındı.
//
// app/sitemap.ts içinde `revalidate = 3600` var — bu, sitemap'in en fazla 1
// saat "bayat" (stale) kalabileceğini söyler ama bunu kendi kendine kontrol
// eden bir zamanlayıcı yoktur. Cache sadece /sitemap.xml'e bir İSTEK geldiğinde
// yenilenir. Kimse (kullanıcı veya bot) siteye o gün hiç uğramazsa, gün değişse
// bile sitemap eski günün maçlarıyla kalabilir.
//
// Bu route tam olarak o isteği üretir: revalidatePath('/sitemap.xml') çağrısı
// sitemap'in cache'ini hemen geçersiz kılar, böylece bir sonraki (bot veya
// kullanıcı) ziyaretinde güncel gün + güncel maçlarla yeniden üretilir.
// ---------------------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  revalidatePath("/sitemap.xml")

  return Response.json({ revalidated: true, path: "/sitemap.xml", now: new Date().toISOString() })
}
