import { FEATURED_LEAGUES } from '@/lib/leagues'

function getCurrentTransfermarktSeason(date = new Date()) {
  const year = date.getUTCFullYear()
  return date.getUTCMonth() >= 6 ? year : year - 1
}

export const TRANSFERMARKT_SEASON = getCurrentTransfermarktSeason()

const CALENDAR_YEAR_COMPETITIONS = new Set(['NO1', 'MLS1', 'AR1N'])

const TRANSFERMARKT_COMPETITIONS: Record<number, string> = {
  39: 'GB1', 140: 'ES1', 135: 'IT1', 78: 'L1', 61: 'FR1', 94: 'PO1',
  203: 'TR1', 88: 'NL1', 235: 'RU1', 144: 'BE1', 197: 'GR1', 333: 'UKR1',
  345: 'TS1', 119: 'DK1', 179: 'SC1', 106: 'PL1', 103: 'NO1', 218: 'A1',
  207: 'C1', 286: 'SER1', 307: 'SA1', 253: 'MLS1', 128: 'AR1N',
}

export const IMPORT_LEAGUES = FEATURED_LEAGUES.filter((league) => league.country !== 'Avrupa').map(
  (league) => {
    const transfermarktId = TRANSFERMARKT_COMPETITIONS[league.id]
    const transfermarktSeason = CALENDAR_YEAR_COMPETITIONS.has(transfermarktId) ? TRANSFERMARKT_SEASON - 1 : TRANSFERMARKT_SEASON
    return {
      apiFootballId: league.id,
      transfermarktId,
      transfermarktSeason,
      name: league.name,
      country: league.country,
      transfermarktUrl: `https://www.transfermarkt.com/wettbewerb/startseite/wettbewerb/${transfermarktId}/saison_id/${transfermarktSeason}`,
    }
  },
)

if (IMPORT_LEAGUES.length !== 23 || IMPORT_LEAGUES.some((league) => !league.transfermarktId)) {
  throw new Error('Veri aktarımı kapsamı tam olarak 23 kaynak eşlemeli ulusal lig içermelidir.')
}

export type ImportSource = 'transfermarkt' | 'api_football'
export type ImportLeague = (typeof IMPORT_LEAGUES)[number]

export const RESET_PHRASES: Record<ImportSource, string> = {
  transfermarkt: 'TRANSFERMARKT VERİLERİNİ SİL',
  api_football: 'API-FOOTBALL VERİLERİNİ SİL',
}
