import { after } from "next/server"
import { syncLeagueMarketValues, cleanupStaleMarketValueRows, SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"

// ---------------------------------------------------------------------------
// Vercel Cron her Pazar 00:00 (İstanbul saati) bu endpoint'i tetikler
// (bkz. vercel.json — "0 21 * * 6" = Cumartesi 21:00 UTC = Pazar 00:00 TR).
//
// 23 lig tek bir istekte işlenmiyor (Transfermarkt + API-Football'a yüzlerce
// istek gidiyor, serverless zaman aşımı riski var). Bunun yerine bu route
// kendi kendini zincirler: her çağrı SADECE bir ligi işler, sonra bir sonraki
// ligi tetikleyip (after() ile, cevabı bekletmeden) hemen yanıt döner.
//
// Zincirdeki her çağrı, aynı "runStartedAt" değerini (ilk çağrıda üretilir,
// URL'de taşınır) ve o ana kadar herhangi bir ligde hata olup olmadığını
// ("hadErrors") sonraki çağrıya iletir. Son lig işlendiğinde, hiç hata
// olmadıysa hayalet kayıt temizliği (cleanupStaleMarketValueRows) tetiklenir
// — bkz. lib/market-value-sync.ts.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // CRON_SECRET henüz tanımlı değilse kontrolü atla (geliştirme/ilk kurulum).
  // Üretime alınmadan önce CRON_SECRET eklenmesi önerilir.
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function triggerNextLeague(request: Request, nextIndex: number, runStartedAt: string, hadErrors: boolean): Promise<void> {
  const url = new URL(request.url)
  url.searchParams.set("leagueIndex", String(nextIndex))
  url.searchParams.set("runStartedAt", runStartedAt)
  url.searchParams.set("hadErrors", hadErrors ? "1" : "0")

  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`

  try {
    await fetch(url.toString(), { headers })
  } catch (err) {
    console.error(`[v0] Bir sonraki lig (index ${nextIndex}) tetiklenemedi:`, err)
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const leagueIndex = Number(searchParams.get("leagueIndex") ?? "0")
  // İlk çağrıda (leagueIndex 0) yeni bir döngü başlar — runStartedAt burada
  // üretilip zincir boyunca aynı değer taşınır (bkz. triggerNextLeague).
  const runStartedAt = new Date(searchParams.get("runStartedAt") ?? new Date().toISOString())
  const hadErrorsSoFar = searchParams.get("hadErrors") === "1"

  if (!Number.isInteger(leagueIndex) || leagueIndex < 0) {
    return Response.json({ error: "Geçersiz leagueIndex" }, { status: 400 })
  }

  if (leagueIndex >= SCRAPABLE_LEAGUE_IDS.length) {
    // Zincirdeki son adım: tüm ligler işlendi. Hiç hata olmadıysa, artık
    // hiçbir taranan ligde/kadroda görünmeyen "hayalet" kayıtları temizle.
    const cleanup = await cleanupStaleMarketValueRows(runStartedAt, hadErrorsSoFar)
    return Response.json({ done: true, message: "Tüm ligler işlendi.", cleanup })
  }

  const leagueId = SCRAPABLE_LEAGUE_IDS[leagueIndex]

  let result: Awaited<ReturnType<typeof syncLeagueMarketValues>> | null = null
  let error: string | null = null
  try {
    result = await syncLeagueMarketValues(leagueId, runStartedAt)
  } catch (err) {
    error = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.error(`[v0] Lig ${leagueId} güncellenirken hata:`, err)
  }

  const hadErrors = hadErrorsSoFar || error !== null
  const nextIndex = leagueIndex + 1
  // Son ligden sonra da (nextIndex === totalLeagues) zinciri devam ettiriyoruz —
  // bu sayede "done" adımı ayrı bir istekte çalışıp temizliği tetikler.
  after(() => triggerNextLeague(request, nextIndex, runStartedAt.toISOString(), hadErrors))

  return Response.json({
    leagueIndex,
    leagueId,
    result,
    error,
    nextIndex: nextIndex <= SCRAPABLE_LEAGUE_IDS.length ? nextIndex : null,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
  })
}
