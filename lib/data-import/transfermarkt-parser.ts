import * as cheerio from 'cheerio'

export class TransfermarktParseError extends Error {
  constructor(message: string, public readonly kind: 'blocked' | 'parser_changed' | 'invalid_value') { super(message) }
}

export function classifyTransfermarktPage(html: string, status = 200) {
  const normalized = html.toLowerCase()
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (/captcha|access denied|unusual traffic|robot check|verify you are human|consent\.transfermarkt/.test(normalized)) return 'captcha_or_robot'
  return null
}

function sourceIdFromUrl(url: string, segment: string) {
  const path = url.split('?')[0]
  const parts = path.split('/').filter(Boolean)
  const segmentIndex = parts.lastIndexOf(segment)
  if (segmentIndex < 0) return null
  return parts.slice(segmentIndex + 1).find((part) => /^\d+$/.test(part)) ?? null
}

function absoluteUrl(href: string) {
  return new URL(href, 'https://www.transfermarkt.com').toString()
}

export function buildCompetitionClubsUrl(competitionId: string, season: number) {
  return `https://www.transfermarkt.com/wettbewerb/startseite/wettbewerb/${competitionId}/saison_id/${season}`
}

export function buildTeamSquadUrl(teamUrl: string, season: number) {
  const url = new URL(teamUrl, 'https://www.transfermarkt.com')
  const parts = url.pathname.split('/').filter(Boolean)
  const vereinIndex = parts.lastIndexOf('verein')
  const teamId = vereinIndex >= 0 ? parts.slice(vereinIndex + 1).find((part) => /^\d+$/.test(part)) : null
  if (!teamId) throw new TransfermarktParseError(`Takım kimliği URL'den çıkarılamadı: ${teamUrl}`, 'invalid_value')
  const slug = parts[0] || 'club'
  return `https://www.transfermarkt.com/${slug}/kader/verein/${teamId}/saison_id/${season}/plus/1`
}

export function parseMarketValueEur(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === '-' || /not available/i.test(raw)) return null
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
    const sourceId = sourceIdFromUrl(href, 'verein')
    const imageAlt = $(element).find('img').attr('alt')
    const name = ($(element).attr('title') || imageAlt || $(element).text()).replace(/\s+/g, ' ').trim()
    if (sourceId && name.length > 1 && !/^(squad|fixtures|table)$/i.test(name)) teams.set(sourceId, { sourceId, name, url: absoluteUrl(href) })
  })
  if (!teams.size) throw new TransfermarktParseError('Lig sayfasında takım bağlantısı bulunamadı.', 'parser_changed')
  return [...teams.values()]
}

export function parseTeamSquad(html: string) {
  const blocked = classifyTransfermarktPage(html)
  if (blocked) throw new TransfermarktParseError(`Transfermarkt erişimi engellendi: ${blocked}`, 'blocked')
  const $ = cheerio.load(html)
  const players = new Map<string, { sourceId: string; name: string; url: string }>()
  const collectPlayers = (selector: string) => {
    $(selector).each((_, element) => {
      const href = $(element).attr('href'); if (!href) return
      const sourceId = sourceIdFromUrl(href, 'spieler')
      const imageAlt = $(element).find('img').attr('alt')
      const name = (imageAlt || $(element).attr('title') || $(element).text()).replace(/^#\d+\s*/, '').replace(/\s+/g, ' ').trim()
      if (sourceId && !players.has(sourceId) && name.length > 1 && !/^[€$£]|^-$/.test(name)) players.set(sourceId, { sourceId, name, url: absoluteUrl(href) })
    })
  }
  collectPlayers('a[href*="/profil/spieler/"]')
  if (!players.size) collectPlayers('a[href*="/spieler/"]')
  if (!players.size) throw new TransfermarktParseError('Tam kadro sayfasında oyuncu bağlantısı bulunamadı.', 'parser_changed')
  return [...players.values()]
}

function labeledValue($: cheerio.CheerioAPI, labels: RegExp) {
  let result: string | undefined
  $('.info-table__content, .data-header__label').each((_, element) => {
    if (result) return
    const text = $(element).text().replace(/\s+/g, ' ').trim()
    if (!labels.test(text)) return
    const sibling = $(element).next('.info-table__content').text().replace(/\s+/g, ' ').trim()
    result = sibling || text.replace(labels, '').replace(/^\s*:\s*/, '').trim()
  })
  return result
}

export function parsePlayerDetail(html: string) {
  const blocked = classifyTransfermarktPage(html)
  if (blocked) throw new TransfermarktParseError(`Transfermarkt erişimi engellendi: ${blocked}`, 'blocked')
  const $ = cheerio.load(html)
  const text = $('body').text().replace(/\s+/g, ' ')
  const name = $('h1').first().text().trim().replace(/^#\d+\s*/, '').trim() || $('.data-header__headline-wrapper').first().text().trim().replace(/^#\d+\s*/, '').trim()
  const marketValueRaw = $('.data-header__market-value-wrapper').first().text().replace(/Last update:[\s\S]*/i, '').replace(/\s+/g, '').trim() || null
  const position = labeledValue($, /^Position:?/i) || text.match(/Position:\s*([^,|]+?)(?=\s*(?:Foot:|Player agent:|Current club:|Joined:))/i)?.[1]?.trim()
  const currentTeamName = $('.data-header__club a').first().attr('title')?.trim() || $('.data-header__club').first().text().replace(/\s+/g, ' ').trim() || text.match(/Current club:\s*(.+?)(?=\s*(?:Joined:|Contract expires:|Outfitter:))/i)?.[1]?.trim()
  const birthRaw = $('span[itemprop="birthDate"]').attr('content') || $('meta[itemprop="birthDate"]').attr('content') || labeledValue($, /^Date of birth(?:\/Age)?:?/i) || text.match(/Date of birth[^:]*:\s*([^()]+?)(?=\s*Place of birth:|\s*Age:)/i)?.[1]?.trim()
  const birthDate = parseDate(birthRaw)
  if (!name || !position || !currentTeamName || !birthDate) throw new TransfermarktParseError('Zorunlu oyuncu detay alanları eksik; profil tamamlanamadı.', 'parser_changed')
  return { name, birthDate, detailedPosition: position, marketValueRaw, marketValueEur: parseMarketValueEur(marketValueRaw), currentTeamName }
}
