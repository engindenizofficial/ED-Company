import { classifyTransfermarktPage } from './transfermarkt-parser'

const USER_AGENT = 'EDAnalyticsDataImporter/1.0 (+https://www.edcompanyofficial.com; respectful snapshot import)'
const TIMEOUT_MS = 20_000
const MAX_RETRIES = 2
let lastRequestAt = 0

export class TransfermarktHttpError extends Error {
  constructor(message: string, public readonly kind: string, public readonly retryable: boolean, public readonly status?: number) { super(message) }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchTransfermarktHtml(url: string) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const delay = Math.max(0, 1400 + Math.floor(Math.random() * 600) - (Date.now() - lastRequestAt))
    if (delay) await wait(delay)
    lastRequestAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: controller.signal, cache: 'no-store' })
      const html = await response.text()
      const blocked = classifyTransfermarktPage(html, response.status)
      if (blocked) throw new TransfermarktHttpError(`Transfermarkt isteği engellendi (${blocked}).`, blocked, response.status === 429, response.status)
      if (!response.ok) throw new TransfermarktHttpError(`Transfermarkt HTTP ${response.status}`, 'http', response.status >= 500, response.status)
      return html
    } catch (error) {
      const normalized = error instanceof TransfermarktHttpError ? error : new TransfermarktHttpError(error instanceof Error ? error.message : 'Ağ hatası', 'timeout_or_network', true)
      if (!normalized.retryable || attempt === MAX_RETRIES) throw normalized
      await wait(1000 * 2 ** attempt)
    } finally { clearTimeout(timeout) }
  }
  throw new TransfermarktHttpError('Transfermarkt isteği tamamlanamadı.', 'network', true)
}
