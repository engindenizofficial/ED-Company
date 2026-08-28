import { pool } from "@/lib/db"
import { getActiveCronRun, MARKET_VALUE_WORKER_LOCK_KEY, processCronRunBatch } from "@/lib/market-value-cron-run"
import { enqueueMarketValueWorker } from "@/lib/market-value-qstash"

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface WorkerMessage {
  runId?: string
}

export async function POST(request: Request) {
  const message = (await request.json().catch(() => ({}))) as WorkerMessage
  if (!message.runId) return Response.json({ error: "runId gerekli" }, { status: 400 })

  const lockClient = await pool.connect()

  try {
    const lockResult = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [MARKET_VALUE_WORKER_LOCK_KEY])
    if (!lockResult.rows[0]?.locked) return Response.json({ done: false, skipped: "workerAlreadyRunning" })

    const active = await getActiveCronRun()
    if (!active || active.id !== message.runId) {
      return Response.json({ done: true, skipped: "runNoLongerActive" })
    }

    const result = await processCronRunBatch(active)
    if (result.run.status === "running" && !result.done && !result.run.lastError) {
      await enqueueMarketValueWorker(result.run.id, 1)
    }

    return Response.json({
      done: result.done,
      steps: result.steps,
      runId: result.run.id,
      phase: result.run.phase,
      currentLeagueIndex: result.run.currentLeagueIndex,
      currentTeamIndex: result.run.currentTeamIndex,
      lastError: result.run.lastError,
    })
  } finally {
    await lockClient.query("select pg_advisory_unlock($1)", [MARKET_VALUE_WORKER_LOCK_KEY]).catch(() => undefined)
    lockClient.release()
  }
}
