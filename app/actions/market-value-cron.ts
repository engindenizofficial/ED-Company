"use server"

import { desc } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueCronRun } from "@/lib/db/schema"
import { resetAndCreateCronRun } from "@/lib/market-value-cron-run"
import { enqueueMarketValueSupervisor, enqueueMarketValueWorker } from "@/lib/market-value-qstash"
import { SCRAPABLE_LEAGUE_IDS } from "@/lib/transfermarkt-scraper"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) throw new Error("Unauthorized")
}

export interface CronRunStatus {
  id: string
  status: string
  phase: string
  currentLeagueIndex: number
  currentTeamIndex: number
  totalLeagues: number
  runStartedAt: string
  heartbeatAt: string
  lastError: string | null
  lastErrorAt: string | null
  isStale: boolean
}

function serialize(row: typeof marketValueCronRun.$inferSelect): CronRunStatus {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    currentLeagueIndex: row.currentLeagueIndex,
    currentTeamIndex: row.currentTeamIndex,
    totalLeagues: SCRAPABLE_LEAGUE_IDS.length,
    runStartedAt: row.runStartedAt.toISOString(),
    heartbeatAt: row.heartbeatAt.toISOString(),
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    isStale: row.status === "running" && Date.now() - row.heartbeatAt.getTime() > 3 * 60_000,
  }
}

export async function getMarketValueCronStatus(): Promise<CronRunStatus | null> {
  await requireAdmin()
  const [row] = await db.select().from(marketValueCronRun).orderBy(desc(marketValueCronRun.createdAt)).limit(1)
  return row ? serialize(row) : null
}

export async function startMarketValueScan(): Promise<{ started: true; status: CronRunStatus }> {
  await requireAdmin()
  const run = await resetAndCreateCronRun()
  // Gözetmeni önce kur: ilk worker yayını geçici olarak başarısız olsa bile
  // dakikalık kontrol bu run'ı bulup kaldığı ilk adımdan başlatabilsin.
  await enqueueMarketValueSupervisor(run.id, 60)
  await enqueueMarketValueWorker(run.id)
  return { started: true, status: serialize(run) }
}
