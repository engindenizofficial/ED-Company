import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, pool } from '@/lib/db'
import {
  apiFootballLeagueSnapshot,
  apiFootballPlayerSnapshot,
  apiFootballTeamSnapshot,
  dataImportCheckpoint,
  dataImportError,
  dataImportRun,
  transfermarktLeague,
  transfermarktPlayer,
  transfermarktTeam,
} from '@/lib/db/schema'
import type { ImportSource } from './scope'

export const ACTIVE_STATUSES = ['queued', 'running', 'stale'] as const
export const STALE_AFTER_MS = 3 * 60 * 1000

export async function createImportRun(source: ImportSource, idempotencyKey = `${source}:${Date.now()}`) {
  const existing = await db.query.dataImportRun.findFirst({
    where: and(eq(dataImportRun.source, source), inArray(dataImportRun.status, [...ACTIVE_STATUSES])),
    orderBy: [desc(dataImportRun.createdAt)],
  })
  if (existing) return { run: existing, created: false }
  const [run] = await db.insert(dataImportRun).values({ id: randomUUID(), source, idempotencyKey }).returning()
  return { run, created: true }
}

export async function bindWorkflowRun(importRunId: string, workflowRunId: string, restarting = false) {
  const [run] = await db.update(dataImportRun).set({
    workflowRunId,
    status: 'running',
    heartbeatAt: new Date(),
    updatedAt: new Date(),
    ...(restarting ? { restartCount: sql`${dataImportRun.restartCount} + 1` } : {}),
  }).where(eq(dataImportRun.id, importRunId)).returning()
  return run
}

export async function heartbeat(runId: string, values: Partial<typeof dataImportRun.$inferInsert> = {}) {
  await db.update(dataImportRun).set({ ...values, heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(dataImportRun.id, runId))
}

export type ProgressMetric = 'totalTeams' | 'processedTeams' | 'successfulTeams' | 'failedTeams' | 'totalPlayers' | 'processedPlayers' | 'successfulPlayers' | 'failedPlayers' | 'missingPlayers' | 'processedLeagues' | 'successfulLeagues' | 'failedLeagues'
export async function incrementProgress(runId: string, metric: ProgressMetric, amount = 1) {
  const column = dataImportRun[metric]
  await db.update(dataImportRun).set({ [metric]: sql`${column} + ${amount}`, heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(dataImportRun.id, runId))
}

export async function isCheckpointComplete(runId: string, kind: string, itemKey: string) {
  const checkpoint = await db.query.dataImportCheckpoint.findFirst({
    where: and(eq(dataImportCheckpoint.runId, runId), eq(dataImportCheckpoint.kind, kind), eq(dataImportCheckpoint.itemKey, itemKey)),
  })
  return checkpoint?.status === 'completed'
}

export async function completeCheckpoint(input: {
  runId: string; source: ImportSource; kind: string; itemKey: string; parentKey?: string; url?: string; metadata?: Record<string, unknown>
}) {
  await db.insert(dataImportCheckpoint).values({
    id: randomUUID(), ...input, status: 'completed', attempts: 1, completedAt: new Date(), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [dataImportCheckpoint.runId, dataImportCheckpoint.kind, dataImportCheckpoint.itemKey],
    set: { status: 'completed', completedAt: new Date(), updatedAt: new Date(), metadata: input.metadata ?? {} },
  })
}

export async function recordImportError(input: {
  runId: string; source: ImportSource; kind: string; itemKey?: string; errorType: string; message: string; url?: string; retryable?: boolean; attempt?: number; details?: Record<string, unknown>
}) {
  const safeMessage = input.message.replace(/x-apisports-key\s*[:=]\s*\S+/gi, 'x-apisports-key=[redacted]').slice(0, 2000)
  await db.insert(dataImportError).values({ id: randomUUID(), ...input, message: safeMessage })
  await heartbeat(input.runId, { errorType: input.errorType, errorMessage: safeMessage })
}

export async function finishRun(runId: string, source: ImportSource) {
  await db.transaction(async (tx) => {
    if (source === 'transfermarkt') {
      await tx.delete(transfermarktPlayer).where(ne(transfermarktPlayer.runId, runId))
      await tx.delete(transfermarktTeam).where(ne(transfermarktTeam.runId, runId))
      await tx.delete(transfermarktLeague).where(ne(transfermarktLeague.runId, runId))
    } else {
      await tx.delete(apiFootballPlayerSnapshot).where(ne(apiFootballPlayerSnapshot.runId, runId))
      await tx.delete(apiFootballTeamSnapshot).where(ne(apiFootballTeamSnapshot.runId, runId))
      await tx.delete(apiFootballLeagueSnapshot).where(ne(apiFootballLeagueSnapshot.runId, runId))
    }
    await tx.update(dataImportRun).set({ status: 'completed', stage: 'completed', finishedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date(), activeUrl: null }).where(eq(dataImportRun.id, runId))
  })
}

export async function failRun(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Bilinmeyen veri aktarım hatası'
  await db.update(dataImportRun).set({ status: 'failed', errorType: 'workflow', errorMessage: message.slice(0, 2000), finishedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(dataImportRun.id, runId))
}

export async function getImportDashboard() {
  try {
    const runs = await db.select().from(dataImportRun).orderBy(desc(dataImportRun.createdAt)).limit(50)
    const latest = new Map<ImportSource, (typeof runs)[number]>()
    for (const run of runs) if (!latest.has(run.source as ImportSource)) latest.set(run.source as ImportSource, run)
    const latestIds = [...latest.values()].map((run) => run.id)
    const [checkpoints, errors] = latestIds.length ? await Promise.all([
      db.select().from(dataImportCheckpoint).where(inArray(dataImportCheckpoint.runId, latestIds)).orderBy(desc(dataImportCheckpoint.updatedAt)).limit(500),
      db.select().from(dataImportError).where(inArray(dataImportError.runId, latestIds)).orderBy(desc(dataImportError.createdAt)).limit(200),
    ]) : [[], []]
    return { available: true, runs: Object.fromEntries(latest), checkpoints, errors }
  } catch {
    return { available: false, runs: {}, checkpoints: [], errors: [], message: 'Migration henüz uygulanmadı veya veri tabanı kullanılamıyor.' }
  }
}

export async function findRestartCandidates() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS)
  return db.select().from(dataImportRun).where(and(
    eq(dataImportRun.autoResume, true),
    sql`(${dataImportRun.status} IN ('failed','stopped','stale') OR (${dataImportRun.status} = 'running' AND ${dataImportRun.heartbeatAt} < ${staleBefore}))`,
  )).orderBy(desc(dataImportRun.createdAt))
}

export async function markStale(runId: string) {
  await db.update(dataImportRun).set({ status: 'stale', stage: 'watchdog-restart', updatedAt: new Date() }).where(eq(dataImportRun.id, runId))
}

export async function withSourceLock<T>(source: ImportSource, action: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect()
  const lockId = source === 'transfermarkt' ? 9042301 : 9042302
  try {
    const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [lockId])
    if (!result.rows[0]?.locked) return null
    try { return await action() } finally { await client.query('SELECT pg_advisory_unlock($1)', [lockId]) }
  } finally { client.release() }
}

export async function resetSource(source: ImportSource) {
  await db.transaction(async (tx) => {
    if (source === 'transfermarkt') {
      await tx.delete(transfermarktPlayer); await tx.delete(transfermarktTeam); await tx.delete(transfermarktLeague)
    } else {
      await tx.delete(apiFootballPlayerSnapshot); await tx.delete(apiFootballTeamSnapshot); await tx.delete(apiFootballLeagueSnapshot)
    }
    const runIds = await tx.select({ id: dataImportRun.id }).from(dataImportRun).where(eq(dataImportRun.source, source))
    if (runIds.length) await tx.delete(dataImportRun).where(inArray(dataImportRun.id, runIds.map((row) => row.id)))
  })
}
