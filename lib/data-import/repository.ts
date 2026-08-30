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
  playerMatchRun,
  transfermarktLeague,
  transfermarktPlayer,
  transfermarktTeam,
} from '@/lib/db/schema'
import type { ImportSource } from './scope'

export const ACTIVE_STATUSES = ['queued', 'running', 'stale'] as const
export const STALE_AFTER_MS = 3 * 60 * 1000
export const IMPORT_CANCELLED_ERROR = 'IMPORT_RUN_CANCELLED'

export async function assertImportRunActive(runId: string) {
  const run = await db.query.dataImportRun.findFirst({
    columns: { status: true },
    where: eq(dataImportRun.id, runId),
  })
  if (!run || !ACTIVE_STATUSES.includes(run.status as (typeof ACTIVE_STATUSES)[number])) {
    throw new Error(IMPORT_CANCELLED_ERROR)
  }
}

export async function getActiveWorkflowRunIds(source: ImportSource) {
  const runs = await db
    .select({ workflowRunId: dataImportRun.workflowRunId })
    .from(dataImportRun)
    .where(and(eq(dataImportRun.source, source), inArray(dataImportRun.status, [...ACTIVE_STATUSES])))
  return runs.flatMap((run) => run.workflowRunId ? [run.workflowRunId] : [])
}

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
    stage: restarting ? 'restart-queued' : 'queued',
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

export async function getImportErrorCount(runId: string, kind: string, itemKey: string, url?: string) {
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(dataImportError).where(and(
    eq(dataImportError.runId, runId),
    eq(dataImportError.kind, kind),
    eq(dataImportError.itemKey, itemKey),
    url ? eq(dataImportError.url, url) : undefined,
  ))
  return result?.count ?? 0
}

export async function failCheckpoint(input: {
  runId: string; source: ImportSource; kind: string; itemKey: string; parentKey?: string; url?: string; metadata?: Record<string, unknown>
}) {
  await db.insert(dataImportCheckpoint).values({
    id: randomUUID(), ...input, status: 'failed', attempts: 1, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [dataImportCheckpoint.runId, dataImportCheckpoint.kind, dataImportCheckpoint.itemKey],
    set: { status: 'failed', updatedAt: new Date(), metadata: input.metadata ?? {} },
  })
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

    if (!latestIds.length) {
      return { available: true, runs: {}, checkpoints: [], errors: [], summaries: {} }
    }

    const [checkpoints, summaryResult, errorResult] = await Promise.all([
      db.select().from(dataImportCheckpoint).where(inArray(dataImportCheckpoint.runId, latestIds)).orderBy(desc(dataImportCheckpoint.updatedAt)).limit(500),
      pool.query<{
        runId: string
        completedLeagues: number
        latestCompletedAt: Date | null
        discoveredTeams: number
        successfulTeams: number
        discoveredPlayers: number
        successfulPlayers: number
        failedTeams: number
        failedPlayers: number
        failedLeagues: number
        uniqueErrors: number
        repeatedErrors: number
      }>(`
        WITH selected_runs AS (
          SELECT UNNEST($1::text[]) AS "runId"
        ), checkpoint_counts AS (
          SELECT c."runId",
            COUNT(DISTINCT c."itemKey") FILTER (WHERE c.kind = 'league' AND c.status = 'completed')::int AS completed_leagues,
            MAX(c."completedAt") FILTER (WHERE c.status = 'completed') AS latest_completed_at,
            COUNT(DISTINCT c."itemKey") FILTER (WHERE c.kind = 'team_discovered')::int AS discovered_teams,
            COUNT(DISTINCT c."itemKey") FILTER (WHERE c.kind = 'team' AND c.status = 'completed')::int AS successful_teams,
            COUNT(DISTINCT c."itemKey") FILTER (WHERE c.kind = 'player_discovered')::int AS discovered_players,
            COUNT(DISTINCT c."itemKey") FILTER (WHERE c.kind = 'player' AND c.status = 'completed')::int AS successful_players
          FROM data_import_checkpoint c
          WHERE c."runId" = ANY($1::text[])
          GROUP BY c."runId"
        ), error_counts AS (
          SELECT e."runId",
            COUNT(DISTINCT e."itemKey") FILTER (WHERE e.kind = 'team')::int AS failed_teams,
            COUNT(DISTINCT e."itemKey") FILTER (WHERE e.kind = 'player')::int AS failed_players,
            COUNT(DISTINCT e."itemKey") FILTER (WHERE e.kind = 'league')::int AS failed_leagues,
            COUNT(DISTINCT (e.kind, COALESCE(e."itemKey", e.id)))::int AS unique_errors,
            COUNT(*)::int AS repeated_errors
          FROM data_import_error e
          WHERE e."runId" = ANY($1::text[])
          GROUP BY e."runId"
        ), error_discovery AS (
          SELECT e."runId",
            COUNT(DISTINCT e."itemKey") FILTER (WHERE e.kind = 'team')::int AS teams,
            COUNT(DISTINCT e."itemKey") FILTER (WHERE e.kind = 'player')::int AS players
          FROM data_import_error e
          WHERE e."runId" = ANY($1::text[])
          GROUP BY e."runId"
        )
        SELECT r."runId" AS "runId",
          COALESCE(c.completed_leagues, 0)::int AS "completedLeagues",
          c.latest_completed_at AS "latestCompletedAt",
          (CASE WHEN COALESCE(c.discovered_teams, 0) > 0 THEN c.discovered_teams
            ELSE COALESCE(c.successful_teams, 0) + COALESCE(d.teams, 0) END)::int AS "discoveredTeams",
          COALESCE(c.successful_teams, 0)::int AS "successfulTeams",
          (CASE WHEN COALESCE(c.discovered_players, 0) > 0 THEN c.discovered_players
            ELSE COALESCE(c.successful_players, 0) + COALESCE(d.players, 0) END)::int AS "discoveredPlayers",
          COALESCE(c.successful_players, 0)::int AS "successfulPlayers",
          COALESCE(e.failed_teams, 0)::int AS "failedTeams",
          COALESCE(e.failed_players, 0)::int AS "failedPlayers",
          COALESCE(e.failed_leagues, 0)::int AS "failedLeagues",
          COALESCE(e.unique_errors, 0)::int AS "uniqueErrors",
          COALESCE(e.repeated_errors, 0)::int AS "repeatedErrors"
        FROM selected_runs r
        LEFT JOIN checkpoint_counts c ON c."runId" = r."runId"
        LEFT JOIN error_counts e ON e."runId" = r."runId"
        LEFT JOIN error_discovery d ON d."runId" = r."runId"
      `, [latestIds]),
      pool.query<{
        id: string
        runId: string
        source: string
        kind: string
        itemKey: string | null
        errorType: string
        message: string
        retryable: boolean
        occurrences: number
        createdAt: Date
      }>(`
        SELECT CONCAT(e."runId", ':', e.kind, ':', COALESCE(e."itemKey", e.id)) AS id,
          e."runId" AS "runId", e.source, e.kind, e."itemKey" AS "itemKey",
          (ARRAY_AGG(e."errorType" ORDER BY e."createdAt" DESC))[1] AS "errorType",
          (ARRAY_AGG(e.message ORDER BY e."createdAt" DESC))[1] AS message,
          BOOL_OR(e.retryable) AS retryable,
          COUNT(*)::int AS occurrences,
          MAX(e."createdAt") AS "createdAt"
        FROM data_import_error e
        WHERE e."runId" = ANY($1::text[])
        GROUP BY e."runId", e.source, e.kind, e."itemKey", COALESCE(e."itemKey", e.id)
        ORDER BY MAX(e."createdAt") DESC
        LIMIT 200
      `, [latestIds]),
    ])

    const summaries = Object.fromEntries(summaryResult.rows.map((summary) => [summary.runId, summary]))
    return { available: true, runs: Object.fromEntries(latest), checkpoints, errors: errorResult.rows, summaries }
  } catch {
    return { available: false, runs: {}, checkpoints: [], errors: [], summaries: {}, message: 'Migration henüz uygulanmadı veya veri tabanı kullanılamıyor.' }
  }
}

export async function findRestartCandidates() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS)
  return db.select().from(dataImportRun).where(and(
    eq(dataImportRun.autoResume, true),
    sql`(${dataImportRun.status} IN ('failed', 'stopped', 'stale') OR (${dataImportRun.status} = 'running' AND ${dataImportRun.heartbeatAt} < ${staleBefore}))`,
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
    const runIds = await tx
      .select({ id: dataImportRun.id })
      .from(dataImportRun)
      .where(eq(dataImportRun.source, source))

    if (!runIds.length) return

    const ids = runIds.map((row) => row.id)

    // Eşleştirme koşuları kaynak koşularına FK ile bağlıdır. Sonuçları cascade ile
    // temizlemek ve data_import_run silimini engellememeleri için önce onları sil.
    if (source === 'transfermarkt') {
      await tx.delete(playerMatchRun).where(inArray(playerMatchRun.transfermarktRunId, ids))
      await tx.delete(transfermarktPlayer)
      await tx.delete(transfermarktTeam)
      await tx.delete(transfermarktLeague)
    } else {
      await tx.delete(playerMatchRun).where(inArray(playerMatchRun.apiFootballRunId, ids))
      await tx.delete(apiFootballPlayerSnapshot)
      await tx.delete(apiFootballTeamSnapshot)
      await tx.delete(apiFootballLeagueSnapshot)
    }

    await tx.delete(dataImportRun).where(inArray(dataImportRun.id, ids))
  })
}
