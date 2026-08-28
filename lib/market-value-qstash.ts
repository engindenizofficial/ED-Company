import { Client } from "@upstash/qstash"
import { getSiteUrl } from "@/lib/site-url"

interface RunMessage {
  runId: string
}

function getDeliveryBaseUrl() {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (productionHost) return `https://${productionHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
  return getSiteUrl()
}

function getClient() {
  const token = process.env.QSTASH_TOKEN
  if (!token) throw new Error("QSTASH_TOKEN tanımlı değil.")
  return new Client({ token })
}

async function publish(path: string, body: RunMessage, delay: number) {
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return getClient().publishJSON({
    url: `${getDeliveryBaseUrl()}${path}`,
    body,
    headers: protectionBypass
      ? { "x-vercel-protection-bypass": protectionBypass }
      : undefined,
    delay,
    // Tek bir geçici ağ/5xx hatası worker zincirini sonsuza dek kesmesin.
    // QStash teslimatları artan gecikmeyle yeniden dener; advisory lock aynı
    // adımın paralel işlenmesini engellemeye devam eder.
    retries: 3,
  })
}

export function enqueueMarketValueWorker(runId: string, delay = 0) {
  return publish("/api/market-values/worker", { runId }, delay)
}

export function enqueueMarketValueSupervisor(runId: string, delay = 60) {
  return publish("/api/market-values/supervisor", { runId }, delay)
}
