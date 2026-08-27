import { pool } from "@/lib/db"
import { getActiveCronRun, processCronRunBatch } from "@/lib/market-value-cron-run"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const lockClient = await pool.connect()
  const lockKey = 884_210_731
  try {
    const lockResult = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [lockKey])
    if (!lockResult.rows[0]?.locked) return Response.json({ done: false, skipped: "workerAlreadyRunning" })

    const active = await getActiveCronRun()
    if (!active) return Response.json({ done: false, skipped: "noActiveRun" })

    const result = await processCronRunBatch(active)
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
    await lockClient.query("select pg_advisory_unlock($1)", [lockKey]).catch(() => undefined)
    lockClient.release()
  }
}
