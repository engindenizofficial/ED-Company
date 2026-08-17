import { after } from "next/server"
import { runPlayerPowerBackfillBatch } from "@/lib/player-power-backfill"
import { triggerChainContinuation } from "@/lib/market-value-cron-run"

// ---------------------------------------------------------------------------
// Tam sezon güç motoru backfill'i. vercel.json'da otomatik bir cron
// ZAMANLAMASI YOK — `app/api/cron/backfill-player-positions` ile aynı
// bilinçli tasarım: tek bir tetikleme (admin panelinden veya bu route'a bir
// GET isteğiyle) başlatılır ve kendi kendini `after()` ile tetikleyerek tüm
// 24 lig (bkz. lib/leagues.ts FEATURED_LEAGUE_IDS) taranana kadar arka
// planda devam eder.
//
// İlerleme `player_power_backfill_cron_run` tablosunda (lig index'i +
// lig-içi fikstür index'i) kalıcı tutulur — zincir bir yerde kesilirse
// (deploy, serverless zaman aşımı, ağ hatası), bu route'a tekrar bir GET
// isteği atmak yeterlidir, kaldığı yerden otomatik devam eder.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

// Bkz. app/api/cron/backfill-player-positions/route.ts — aynı sebeple aynı
// dayanıklı triggerChainContinuation'a geçildi (zaman aşımı + 3 deneme).
async function triggerNextStep(request: Request): Promise<void> {
  const headers: Record<string, string> = {}
  const secret = process.env.CRON_SECRET
  if (secret) headers.authorization = `Bearer ${secret}`
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret

  await triggerChainContinuation(request.url, headers)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runPlayerPowerBackfillBatch()

    if (!result.done) {
      // Bir sonraki adımı arka planda tetikle — bu isteğin cevabı kullanıcıya
      // hemen döner, backfill kesintisiz devam eder.
      after(() => triggerNextStep(request))
    }

    return Response.json(result)
  } catch (err) {
    console.error("[v0] Güç backfill hatası:", err)
    return Response.json({ error: "Güç backfill başarısız oldu." }, { status: 500 })
  }
}
