"use server"

import { and, asc, count, desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import {
  leagueMarketValue,
  marketValueCronRun,
  marketValueLeagueStaging,
  marketValuePlayerStaging,
  marketValueReviewQueue,
  marketValueTeamStaging,
  playerMarketValue,
  teamMarketValue,
} from "@/lib/db/schema"
import { MARKET_VALUE_WORKER_LOCK_KEY, pauseCronRun, resetAndCreateCronRun, resumeCronRun } from "@/lib/market-value-cron-run"
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
  progress: { current: number; total: number; percent: number; unit: "lig" | "takım" }
  currentItem: string | null
  staging: {
    leagues: number
    transfermarktTeams: number
    transfermarktPlayers: number
    apiFootballTeams: number
    apiFootballPlayers: number
    missingTransfermarktSquads: number
  }
  results: { leagues: number; teams: number; players: number; pendingReviews: number }
}

type CronRow = typeof marketValueCronRun.$inferSelect

function totalOf(rows: { value: number }[]) {
  return Number(rows[0]?.value ?? 0)
}

async function serialize(row: CronRow): Promise<CronRunStatus> {
  const runId = row.id
  const [
    leagueCount,
    tmTeamCount,
    tmPlayerCount,
    afTeamCount,
    afPlayerCount,
    missingTmSquadCount,
    finalLeagueCount,
    finalTeamCount,
    finalPlayerCount,
    reviewCount,
  ] = await Promise.all([
    db.select({ value: count() }).from(marketValueLeagueStaging).where(eq(marketValueLeagueStaging.runId, runId)),
    db.select({ value: sql<number>`count(distinct ${marketValueTeamStaging.externalId})` }).from(marketValueTeamStaging).where(and(eq(marketValueTeamStaging.runId, runId), eq(marketValueTeamStaging.side, "tm"))),
    db.select({ value: sql<number>`count(distinct ${marketValuePlayerStaging.externalId})` }).from(marketValuePlayerStaging).where(and(eq(marketValuePlayerStaging.runId, runId), eq(marketValuePlayerStaging.side, "tm"))),
    db.select({ value: sql<number>`count(distinct ${marketValueTeamStaging.externalId})` }).from(marketValueTeamStaging).where(and(eq(marketValueTeamStaging.runId, runId), eq(marketValueTeamStaging.side, "af"))),
    db.select({ value: sql<number>`count(distinct ${marketValuePlayerStaging.externalId})` }).from(marketValuePlayerStaging).where(and(eq(marketValuePlayerStaging.runId, runId), eq(marketValuePlayerStaging.side, "af"))),
    db.execute(sql`select count(*)::int as value from market_value_team_staging team where team."runId" = ${runId} and team.side = 'tm' and not exists (select 1 from market_value_player_staging player where player."runId" = team."runId" and player.side = 'tm' and player."teamStagingId" = team.id)`),
    db.select({ value: count() }).from(leagueMarketValue),
    db.select({ value: count() }).from(teamMarketValue),
    db.select({ value: count() }).from(playerMarketValue),
    db.select({ value: count() }).from(marketValueReviewQueue).where(and(eq(marketValueReviewQueue.runId, runId), eq(marketValueReviewQueue.status, "pending"))),
  ])

  const staging = {
    leagues: totalOf(leagueCount),
    transfermarktTeams: totalOf(tmTeamCount),
    transfermarktPlayers: totalOf(tmPlayerCount),
    apiFootballTeams: totalOf(afTeamCount),
    apiFootballPlayers: totalOf(afPlayerCount),
    missingTransfermarktSquads: Number(missingTmSquadCount.rows[0]?.value ?? 0),
  }

  const teamPhase = row.phase === "tm_players" || row.phase === "af_players"
  const side = row.phase === "tm_players" ? "tm" : "af"
  const total = teamPhase
    ? side === "tm" ? staging.transfermarktTeams : staging.apiFootballTeams
    : SCRAPABLE_LEAGUE_IDS.length
  const current = row.phase === "done" ? total : teamPhase ? row.currentTeamIndex : row.currentLeagueIndex

  let currentItem: string | null = null
  if (teamPhase && current < total) {
    const [team] = await db
      .select({ name: marketValueTeamStaging.name })
      .from(marketValueTeamStaging)
      .where(and(eq(marketValueTeamStaging.runId, runId), eq(marketValueTeamStaging.side, side)))
      .orderBy(asc(marketValueTeamStaging.createdAt))
      .offset(current)
      .limit(1)
    currentItem = team?.name ?? null
  } else if (row.phase !== "done" && current < SCRAPABLE_LEAGUE_IDS.length) {
    const leagueId = SCRAPABLE_LEAGUE_IDS[current]
    const [league] = await db
      .select({ tmName: marketValueLeagueStaging.tmName, afName: marketValueLeagueStaging.afName })
      .from(marketValueLeagueStaging)
      .where(and(eq(marketValueLeagueStaging.runId, runId), eq(marketValueLeagueStaging.leagueId, leagueId)))
      .limit(1)
    currentItem = league?.afName ?? league?.tmName ?? `Lig ${leagueId}`
  }

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
    progress: {
      current: Math.min(current, total),
      total,
      percent: total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0,
      unit: teamPhase ? "takım" : "lig",
    },
    currentItem,
    staging,
    results: {
      leagues: totalOf(finalLeagueCount),
      teams: totalOf(finalTeamCount),
      players: totalOf(finalPlayerCount),
      pendingReviews: totalOf(reviewCount),
    },
  }
}

export async function getMarketValueCronStatus(): Promise<CronRunStatus | null> {
  await requireAdmin()
  let [row] = await db.select().from(marketValueCronRun).orderBy(desc(marketValueCronRun.createdAt)).limit(1)
  if (!row) return null

  // Admin ekranı açıkken supervisor zinciri de kopmuşsa stale run için yalnız
  // bir istek kurtarma hakkını atomik olarak alır. Böylece 5 saniyelik durum
  // sorguları aynı anda yeni worker mesajları üretmez.
  if (row.status === "running" && Date.now() - row.heartbeatAt.getTime() > 3 * 60_000) {
    const previousHeartbeat = row.heartbeatAt
    const [claimed] = await db
      .update(marketValueCronRun)
      .set({ heartbeatAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(marketValueCronRun.id, row.id),
        eq(marketValueCronRun.status, "running"),
        eq(marketValueCronRun.heartbeatAt, previousHeartbeat),
      ))
      .returning()

    if (claimed) {
      try {
        await Promise.all([
          enqueueMarketValueWorker(claimed.id),
          enqueueMarketValueSupervisor(claimed.id, 60),
        ])
        row = claimed
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const [failed] = await db
          .update(marketValueCronRun)
          .set({
            heartbeatAt: previousHeartbeat,
            lastError: `Otomatik kurtarma tetiklenemedi: ${message}`,
            lastErrorAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(marketValueCronRun.id, claimed.id))
          .returning()
        row = failed ?? row
      }
    }
  }

  return serialize(row)
}

export async function startMarketValueScan(): Promise<{ started: true; status: CronRunStatus }> {
  await requireAdmin()
  const run = await resetAndCreateCronRun()
  await enqueueMarketValueSupervisor(run.id, 60)
  await enqueueMarketValueWorker(run.id)
  return { started: true, status: await serialize(run) }
}

export async function retryMissingTransfermarktSquads(runId: string): Promise<{ started: true; status: CronRunStatus }> {
  await requireAdmin()
  const [run] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MARKET_VALUE_WORKER_LOCK_KEY})`)
    await tx.delete(playerMarketValue)
    await tx.delete(teamMarketValue)
    await tx.delete(leagueMarketValue)
    await tx.delete(marketValueReviewQueue).where(eq(marketValueReviewQueue.runId, runId))
    return tx
      .update(marketValueCronRun)
      .set({
        status: "running",
        phase: "tm_players",
        currentLeagueIndex: 0,
        currentTeamIndex: 0,
        lastError: null,
        lastErrorAt: null,
        heartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(marketValueCronRun.id, runId))
      .returning()
  })
  if (!run) throw new Error("Tamamlanacak tarama bulunamadı.")
  await enqueueMarketValueSupervisor(run.id, 60)
  await enqueueMarketValueWorker(run.id)
  return { started: true, status: await serialize(run) }
}

export async function pauseMarketValueScan(runId: string): Promise<{ paused: true; status: CronRunStatus }> {
  await requireAdmin()
  const run = await pauseCronRun(runId)
  return { paused: true, status: await serialize(run) }
}

export async function resumeMarketValueScan(runId: string): Promise<{ resumed: true; status: CronRunStatus }> {
  await requireAdmin()
  const run = await resumeCronRun(runId)
  await enqueueMarketValueSupervisor(run.id, 60)
  await enqueueMarketValueWorker(run.id)
  return { resumed: true, status: await serialize(run) }
}
