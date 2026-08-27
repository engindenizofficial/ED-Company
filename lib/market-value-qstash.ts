import { Client } from "@upstash/qstash"
import { getSiteUrl } from "@/lib/site-url"

interface RunMessage {
  runId: string
}

function getClient() {
  const token = process.env.QSTASH_TOKEN
  if (!token) throw new Error("QSTASH_TOKEN tanımlı değil.")
  return new Client({ token })
}

async function publish(path: string, body: RunMessage, delay: number) {
  return getClient().publishJSON({
    url: `${getSiteUrl()}${path}`,
    body,
    delay,
    retries: 0,
  })
}

export function enqueueMarketValueWorker(runId: string, delay = 0) {
  return publish("/api/market-values/worker", { runId }, delay)
}

export function enqueueMarketValueSupervisor(runId: string, delay = 60) {
  return publish("/api/market-values/supervisor", { runId }, delay)
}
