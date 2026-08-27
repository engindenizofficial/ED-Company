import { getActiveCronRun } from "@/lib/market-value-cron-run"
import { enqueueMarketValueSupervisor, enqueueMarketValueWorker } from "@/lib/market-value-qstash"

export const dynamic = "force-dynamic"

interface SupervisorMessage {
  runId?: string
}

export async function POST(request: Request) {
  const message = (await request.json().catch(() => ({}))) as SupervisorMessage
  if (!message.runId) return Response.json({ error: "runId gerekli" }, { status: 400 })

  const active = await getActiveCronRun()
  if (!active || active.id !== message.runId) {
    return Response.json({ done: true, skipped: "runNoLongerActive" })
  }

  const stalled = active.lastError !== null || Date.now() - active.heartbeatAt.getTime() >= 60_000
  if (stalled) await enqueueMarketValueWorker(active.id)
  await enqueueMarketValueSupervisor(active.id, 60)

  return Response.json({ done: false, resumed: stalled, runId: active.id })
}
