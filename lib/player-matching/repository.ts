import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, pool } from '@/lib/db'
import { dataImportRun, playerMatchRun } from '@/lib/db/schema'
import type { MatchDecision, MatchPlayer } from './engine'

export async function createPlayerMatchRun() {
  const active = await db.query.playerMatchRun.findFirst({ where: inArray(playerMatchRun.status, ['queued', 'running']), orderBy: [desc(playerMatchRun.createdAt)] })
  if (active) return { run: active, created: false }
  const imports = await db.select().from(dataImportRun).where(and(eq(dataImportRun.status, 'completed'), inArray(dataImportRun.source, ['transfermarkt', 'api_football']))).orderBy(desc(dataImportRun.createdAt))
  const transfermarkt = imports.find((run) => run.source === 'transfermarkt')
  const apiFootball = imports.find((run) => run.source === 'api_football')
  if (!transfermarkt || !apiFootball) throw new Error('Her iki kaynağın da tamamlanmış bir aktarımı gerekli.')
  const [run] = await db.insert(playerMatchRun).values({ id: randomUUID(), transfermarktRunId: transfermarkt.id, apiFootballRunId: apiFootball.id }).returning()
  return { run, created: true }
}

export async function bindPlayerMatchWorkflow(runId: string, workflowRunId: string) {
  await db.update(playerMatchRun).set({ workflowRunId, status: 'running', stage: 'loading', heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(playerMatchRun.id, runId))
}

export async function loadMatchInputs(runId: string): Promise<{ transfermarkt: MatchPlayer[]; apiFootball: MatchPlayer[] }> {
  const run = await db.query.playerMatchRun.findFirst({ where: eq(playerMatchRun.id, runId) })
  if (!run) throw new Error('Eşleştirme koşusu bulunamadı.')
  const [transfermarkt, apiFootball] = await Promise.all([
    pool.query<{ id: string; name: string; birthDate: Date | null; teamName: string }>(`SELECT p."sourceId" id,p.name,p."birthDate" AS "birthDate",p."currentTeamName" AS "teamName" FROM transfermarkt_player_snapshot p WHERE p."runId"=$1 ORDER BY p."sourceId"`, [run.transfermarktRunId]),
    pool.query<{ id: number; name: string; birthDate: Date | null; teamName: string }>(`SELECT p."sourceId" id,p.name,p."birthDate" AS "birthDate",p."currentTeamName" AS "teamName" FROM api_football_player_snapshot p WHERE p."runId"=$1 ORDER BY p."sourceId"`, [run.apiFootballRunId]),
  ])
  return { transfermarkt: transfermarkt.rows, apiFootball: apiFootball.rows }
}

export async function initializePlayerMatchRun(runId: string, totalPlayers: number) {
  await pool.query('DELETE FROM player_match_result WHERE "matchRunId"=$1', [runId])
  await db.update(playerMatchRun).set({ status: 'running', stage: 'matching', totalPlayers, processedPlayers: 0, exactMatches: 0, fuzzyMatches: 0, unmatchedPlayers: 0, errorCount: 0, errorMessage: null, heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(playerMatchRun.id, runId))
}

export async function saveMatchBatch(runId: string, decisions: MatchDecision[]) {
  if (!decisions.length) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const decision of decisions) {
      await client.query(`INSERT INTO player_match_result (id,"matchRunId","transfermarktPlayerId","apiFootballPlayerId","matchedLevel","normalizedTransfermarktName","normalizedApiFootballName","normalizedTeamName","birthDate","nameScore",metadata,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) ON CONFLICT ("matchRunId","transfermarktPlayerId") DO UPDATE SET "apiFootballPlayerId"=excluded."apiFootballPlayerId","matchedLevel"=excluded."matchedLevel","normalizedTransfermarktName"=excluded."normalizedTransfermarktName","normalizedApiFootballName"=excluded."normalizedApiFootballName","normalizedTeamName"=excluded."normalizedTeamName","birthDate"=excluded."birthDate","nameScore"=excluded."nameScore",metadata=excluded.metadata,"updatedAt"=now()`, [randomUUID(), runId, String(decision.transfermarktPlayer.id), decision.apiFootballPlayer ? Number(decision.apiFootballPlayer.id) : null, decision.level, decision.normalizedTransfermarktName, decision.normalizedApiFootballName, decision.normalizedTeamName, decision.birthDate, decision.score, JSON.stringify({ reason: decision.reason ?? null })])
    }
    const exact = decisions.filter((item) => item.level === 'exact_biographic').length
    const fuzzy = decisions.filter((item) => item.level === 'fuzzy_name_birthdate').length
    const unmatched = decisions.length - exact - fuzzy
    await client.query(`UPDATE player_match_run SET "processedPlayers"="processedPlayers"+$2,"exactMatches"="exactMatches"+$3,"fuzzyMatches"="fuzzyMatches"+$4,"unmatchedPlayers"="unmatchedPlayers"+$5,"activePlayer"=$6,"heartbeatAt"=now(),"updatedAt"=now() WHERE id=$1`, [runId, decisions.length, exact, fuzzy, unmatched, decisions.at(-1)?.transfermarktPlayer.name])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function completePlayerMatchRun(runId: string) {
  await db.update(playerMatchRun).set({ status: 'completed', stage: 'completed', activePlayer: null, finishedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(playerMatchRun.id, runId))
}

export async function failPlayerMatchRun(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Bilinmeyen eşleştirme hatası'
  await db.update(playerMatchRun).set({ status: 'failed', stage: 'failed', errorCount: 1, errorMessage: message.slice(0, 2000), finishedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(playerMatchRun.id, runId))
}

export async function getLatestPlayerMatchRun() {
  return db.query.playerMatchRun.findFirst({ orderBy: [desc(playerMatchRun.createdAt)] })
}
