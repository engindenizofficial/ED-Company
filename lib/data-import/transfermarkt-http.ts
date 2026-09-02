import { classifyTransfermarktPage } from './transfermarkt-parser'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
]
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 5
const MIN_INTERVAL_MS = 1800
let lastRequestAt = 0

class TransfermarktHttpError extends Error {
  constructor(message: string, public readonly kind: string, public readonly retryable: boolean, public readonly status?: number) { super(message) }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchTransfermarktHtml(url: string) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const delay = Math.max(0, MIN_INTERVAL_MS + Math.floor(Math.random() * 900) - (Date.now() - lastRequestAt))
    if (delay) await wait(delay)
    lastRequestAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.transfermarkt.com/',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: controller.signal,
        cache: 'no-store',
      })
      const html = await response.text()
      const blocked = classifyTransfermarktPage(html, response.status)
      if (blocked) throw new TransfermarktHttpError(`Transfermarkt isteği engellendi (${blocked}).`, blocked, true, response.status)
      if (!response.ok) throw new TransfermarktHttpError(`Transfermarkt HTTP ${response.status}`, 'http', response.status >= 500 || response.status === 408, response.status)
      if (html.length < 2_000) throw new TransfermarktHttpError('Transfermarkt eksik HTML döndürdü.', 'incomplete_html', true, response.status)
      return html
    } catch (error) {
      const normalized = error instanceof TransfermarktHttpError ? error : new TransfermarktHttpError(error instanceof Error ? error.message : 'Ağ hatası', 'timeout_or_network', true)
      if (!normalized.retryable || attempt === MAX_RETRIES) throw normalized
      const retryAfter = Math.min(60_000, 2_500 * 2 ** attempt) + Math.floor(Math.random() * 2_000)
      await wait(retryAfter)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new TransfermarktHttpError('Transfermarkt isteği tamamlanamadı.', 'network', true)
}
