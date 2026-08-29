import * as cheerio from 'cheerio'

export class TransfermarktParseError extends Error {
  constructor(message: string, public readonly kind: 'blocked' | 'parser_changed' | 'invalid_value') { super(message) }
}

export function classifyTransfermarktPage(html: string, status = 200) {
  const normalized = html.toLowerCase()
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (/captcha|access denied|unusual traffic|robot check|verify you are human/.test(normalized)) return 'captcha_or_robot'
  return null
}

function sourceIdFromUrl(url: string, segment: string) {
  const match = url.match(new RegExp(`/${segment}/(?:[^/]+/)?([A-Za-z0-9_-]+)(?:/|$)`))
  return match?.[1] ?? null
}

export function parseMarketValueEur(raw: string | null | undefined): number | null {
  if (!raw) return null
  const value = raw.replace(/€/g, '').replace(/\s/g, '').replace(',', '.').toLowerCase()
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)(bn|b|m|k|th\.)?/)
  if (!match) throw new TransfermarktParseError(`Piyasa değeri ayrıştırılamadı: ${raw}`, 'invalid_value')
  const factor = match[2] === 'bn' || match[2] === 'b' ? 1_000_000_000 : match[2] === 'm' ? 1_000_000 : match[2] === 'k' || match[2] === 'th.' ? 1_000 : 1
  return Math.round(Number(match[1]) * factor)
}

export function parseDate(value: string | undefined): string | null {
  if (!value) return null
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/)?.[0]
  if (iso) return iso
  const match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null
}

export function parseLeagueTeams(html: string) {
  const blocked = classifyTransfermarktPage(html)
  if (blocked) throw new TransfermarktParseError(`Transfermarkt erişimi engellendi: ${blocked}`, 'blocked')
  const $ = cheerio.load(html)
  const teams = new Map<string, { sourceId: string; name: string; url: string }>()
  $('a[href*="/verein/"]').each((_, element) => {
    const href = $(element).attr('href'); if (!href) return
    const sourceId = sourceIdFromUrl(href, 'verein'); const name = ($(element).attr('title') || $(element).text()).trim()
    if (sourceId && name.length > 1) teams.set(sourceId, { sourceId, name, url: new URL(href, 'https://www.transfermarkt.com').toString() })
  })
  if (!teams.size) throw new TransfermarktParseError('Lig sayfasında takım bağlantısı bulunamadı.', 'parser_changed')
  return [...teams.values()]
}

export function parseTeamSquad(html: string) {
  const blocked = classifyTransfermarktPage(html)
  if (blocked) throw new TransfermarktParseError(`Transfermarkt erişimi engellendi: ${blocked}`, 'blocked')
  const $ = cheerio.load(html)
  const players = new Map<string, { sourceId: string; name: string; url: string }>()
  $('a[href*="/profil/spieler/"]').each((_, element) => {
    const href = $(element).attr('href'); if (!href) return
    const sourceId = sourceIdFromUrl(href, 'spieler'); const name = ($(element).attr('title') || $(element).text()).trim()
    if (sourceId && name.length > 1) players.set(sourceId, { sourceId, name, url: new URL(href, 'https://www.transfermarkt.com').toString() })
  })
  if (!players.size) throw new TransfermarktParseError('Takım sayfasında oyuncu bağlantısı bulunamadı.', 'parser_changed')
  return [...players.values()]
}

export function parsePlayerDetail(html: string) {
  const blocked = classifyTransfermarktPage(html)
  if (blocked) throw new TransfermarktParseError(`Transfermarkt erişimi engellendi: ${blocked}`, 'blocked')
  const $ = cheerio.load(html)
  const text = $('body').text().replace(/\s+/g, ' ')
  const name = $('h1').first().text().trim() || $('.data-header__headline-wrapper').first().text().replace(/#\d+/g, '').trim()
  const marketValueRaw = $('.data-header__market-value-wrapper').first().text().replace(/Last update:.*/i, '').trim() || null
  const position = text.match(/Position:\s*([^,|]+?)(?=\s*(?:Foot:|Player agent:|Current club:|Joined:))/i)?.[1]?.trim()
  const currentTeamName = text.match(/Current club:\s*(.+?)(?=\s*(?:Joined:|Contract expires:|Outfitter:))/i)?.[1]?.trim()
  const birthRaw = $('span[itemprop="birthDate"]').attr('content') || text.match(/Date of birth[^:]*:\s*([^()]+?)(?=\s*Place of birth:|\s*Age:)/i)?.[1]?.trim()
  if (!name || !position || !currentTeamName) throw new TransfermarktParseError('Oyuncu detay alanları eksik; HTML yapısı değişmiş olabilir.', 'parser_changed')
  return { name, birthDate: parseDate(birthRaw), detailedPosition: position, marketValueRaw, marketValueEur: parseMarketValueEur(marketValueRaw), currentTeamName }
}
