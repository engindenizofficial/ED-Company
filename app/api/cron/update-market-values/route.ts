import { getActiveCronRun, processCronRunStep } from "@/lib/market-value-cron-run"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const active = await getActiveCronRun()
  if (!active) return Response.json({ done: false, skipped: "noActiveRun" })

  const result = await processCronRunStep(active)
  return Response.json({
    done: result.done,
    runId: result.run.id,
    phase: result.run.phase,
    currentLeagueIndex: result.run.currentLeagueIndex,
    currentTeamIndex: result.run.currentTeamIndex,
    lastError: result.run.lastError,
  })
}
