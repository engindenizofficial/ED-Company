import { describe, expect, it } from 'vitest'
import {
  buildCompetitionClubsUrl,
  buildTeamSquadUrl,
  classifyTransfermarktPage,
  parseDate,
  parseLeagueTeams,
  parseMarketValueEur,
  parseOverviewMarketValue,
  parsePlayerDetail,
  parseTeamSquad,
  TransfermarktParseError,
} from './transfermarkt-parser'

const leagueFixture = `<table><tr><td><a title="Galatasaray" href="/galatasaray-sk/startseite/verein/141">Galatasaray</a></td></tr></table>`
const squadFixture = `<table><tr><td><a title="Victor Osimhen" href="/victor-osimhen/profil/spieler/401923">Victor Osimhen</a></td></tr></table>`
const playerFixture = `<main><h1>Victor Osimhen</h1><div class="data-header__market-value-wrapper">€75.00m Last update: May 1, 2026</div><span itemprop="birthDate" content="1998-12-29"></span><p>Position: Centre-Forward Foot: right Current club: Galatasaray Joined: Jul 1, 2025 Contract expires: Jun 30, 2029</p></main>`

describe('Transfermarkt fixture parser', () => {
  it('normalizes market values and dates', () => {
    expect(parseMarketValueEur('€75.00m')).toBe(75_000_000)
    expect(parseMarketValueEur('€850k')).toBe(850_000)
    expect(parseMarketValueEur('€1.2bn')).toBe(1_200_000_000)
    expect(parseDate('29.12.1998')).toBe('1998-12-29')
  })

  it('extracts source-provided team and league totals without summing players', () => {
    expect(parseOverviewMarketValue('<main><span>Total market value:</span><strong>€1.18bn</strong></main>')).toEqual({
      marketValueRaw: '€1.18bn',
      marketValueEur: 1_180_000_000,
    })
    expect(parseOverviewMarketValue('<main><div class="data-header__market-value-wrapper">€347.50m</div></main>')).toEqual({
      marketValueRaw: '€347.50m',
      marketValueEur: 347_500_000,
    })
  })

  it('builds season-specific competition and full-squad URLs', () => {
    expect(buildCompetitionClubsUrl('TR1', 2026)).toBe('https://www.transfermarkt.com/wettbewerb/startseite/wettbewerb/TR1/saison_id/2026')
    expect(buildTeamSquadUrl('/galatasaray-sk/startseite/verein/141', 2026)).toBe('https://www.transfermarkt.com/galatasaray-sk/kader/verein/141/saison_id/2026/plus/1')
  })

  it('extracts source-local league, team, and player identity', () => {
    expect(parseLeagueTeams(leagueFixture)[0]).toMatchObject({ sourceId: '141', name: 'Galatasaray' })
    expect(parseTeamSquad(squadFixture)[0]).toMatchObject({ sourceId: '401923', name: 'Victor Osimhen' })
    expect(parseTeamSquad('<a href="/player-name/marktwertverlauf/spieler/99"><img alt="Player Name"></a>')[0]).toMatchObject({ sourceId: '99', name: 'Player Name' })
  })

  it('extracts one detailed position and player detail fields', () => {
    expect(parsePlayerDetail(playerFixture)).toEqual({
      name: 'Victor Osimhen',
      birthDate: '1998-12-29',
      detailedPosition: 'Centre-Forward',
      marketValueRaw: '€75.00m',
      marketValueEur: 75_000_000,
      currentTeamName: 'Galatasaray',
    })
  })

  it('detects blocked and structurally broken pages', () => {
    expect(classifyTransfermarktPage('<title>Verify you are human - CAPTCHA</title>')).toBe('captcha_or_robot')
    expect(() => parseLeagueTeams('<html><body>changed</body></html>')).toThrowError(TransfermarktParseError)
  })
})
