"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { getLatestCronRun, isCronRunStale, type CronRunRow } from "@/lib/market-value-cron-run"
import { SCRAPABLE_LEAGUE_IDS } from "@/lib/market-value-sync"

// ---------------------------------------------------------------------------
// Admin panelinde haftalık piyasa değeri cron döngüsünün durumunu göstermek
// ve zincir kırıldığında (bkz. lib/market-value-cron-run.ts) beklemeden
// manuel devam ettirmek için kullanılan action'lar.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    throw new Error("Unauthorized")
  }
}

export interface CronRunStatus {
  runId: string
  status: "running" | "completed"
  runStartedAt: string
  currentLeagueIndex: number
  totalLeagues: number
  hadErrors: boolean
  isStale: boolean
  failedLeagueIds: number[]
  heartbeatAt: string
}

function toStatus(run: CronRunRow): CronRunStatus {
  return {
    runId: run.id,
    status: run.status,
    runStartedAt: run.runStartedAt.toISOString(),
    currentLeagueIndex: run.currentLeagueIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    hadErrors: run.hadErrors,
    isStale: run.status === "running" && isCronRunStale(run),
    failedLeagueIds: run.leagueStatuses.filter((entry) => entry.status === "failed").map((entry) => entry.leagueId),
    heartbeatAt: run.heartbeatAt.toISOString(),
  }
}

/** Admin panelinde göstermek için en son cron döngüsünün durumunu döndürür. */
export async function getMarketValueCronStatus(): Promise<CronRunStatus | null> {
  await requireAdmin()
  const run = await getLatestCronRun()
  return run ? toStatus(run) : null
}

/**
 * Kırılmış (heartbeat eskimiş, "running" durumda kalmış) bir döngüyü beklemeden
 * devam ettirir — watchdog'un (bkz. app/api/cron/resume-market-values,
 * vercel.json'daki sık aralıklı tetikleme) bir sonraki çalışmasını beklemek
 * istemeyen admin için anlık bir yol. Sağlıklı ilerleyen bir döngüye
 * dokunmaz (aynı güvenlik kontrolü resume route'unda da var).
 */
export async function resumeMarketValueCronNow(): Promise<{ triggered: boolean; reason?: string }> {
  await requireAdmin()

  const run = await getLatestCronRun()
  if (!run || run.status !== "running") {
    return { triggered: false, reason: "Devam eden bir döngü yok." }
  }
  if (!isCronRunStale(run)) {
    return { triggered: false, reason: "Döngü sağlıklı ilerliyor, henüz devam ettirmeye gerek yok." }
  }

  const secret = process.env.CRON_SECRET
  const headersInit: Record<string, string> = {}
  if (secret) headersInit.authorization = `Bearer ${secret}`

  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
  try {
    // Yanıtı beklemiyoruz — zincir kendi kendini after() ile devam ettirecek.
    // (bkz. app/api/cron/resume-market-values/route.ts)
    fetch(`${base}/api/cron/resume-market-values`, { headers: headersInit }).catch((err) => {
      console.error("[v0] Manuel devam ettirme tetiklenemedi:", err)
    })
  } catch (err) {
    console.error("[v0] Manuel devam ettirme tetiklenemedi:", err)
    return { triggered: false, reason: "Tetikleme başarısız oldu." }
  }

  revalidatePath(REVIEW_PATH)
  return { triggered: true }
}
