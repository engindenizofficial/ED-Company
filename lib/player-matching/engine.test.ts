import { describe, expect, it } from 'vitest'
import { matchPlayers } from './engine'
import { normalizeDate, normalizeText } from './normalize'
import { nameSimilarity } from './similarity'

const tm = (id: string, name: string, birthDate: string | null, teamName = 'TM Club') => ({ id, name, birthDate, teamName })
const af = (id: number, name: string, birthDate: string | null, teamName = 'AF Club') => ({ id, name, birthDate, teamName })

describe('player matching normalization', () => {
  it('normalizes Turkish, accented characters, punctuation and whitespace', () => {
    expect(normalizeText('  İĞDE, João  Łukasz!! ')).toBe('igde joao lukasz')
  })

  it('returns strict UTC-safe ISO dates', () => {
    expect(normalizeDate('2001-02-03T22:00:00.000Z')).toBe('2001-02-03')
    expect(normalizeDate('2001-02-30')).toBeNull()
  })

  it('combines token and character similarity', () => {
    expect(nameSimilarity('João Pedro Silva', 'Pedro Silva')).toBeGreaterThan(0.75)
  })
})

describe('birth-date and best-name player matching', () => {
  it('matches similar name spellings on the same birth date', () => {
    const [result] = matchPlayers([tm('1', 'Mehmet Yılmaz', '2000-01-02')], [af(10, 'M. Yilmaz', '2000-01-02')])

    expect(result.level).toBe('matched')
    expect(result.apiFootballPlayer?.id).toBe(10)
  })

  it('matches regardless of different teams', () => {
    const [result] = matchPlayers(
      [tm('1', 'João Pedro Silva', '1998-05-10', 'Old Club')],
      [af(10, 'Pedro Silva', '1998-05-10', 'New Club')],
    )

    expect(result.level).toBe('matched')
    expect(result.apiFootballPlayer?.id).toBe(10)
  })

  it('matches the only same-date candidate even with a low name score', () => {
    const [result] = matchPlayers([tm('1', 'Completely Different', '1998-05-10')], [af(10, 'Other Person', '1998-05-10')])

    expect(result.level).toBe('matched')
    expect(result.apiFootballPlayer?.id).toBe(10)
  })

  it('selects the highest name score among same-date candidates', () => {
    const [result] = matchPlayers([tm('1', 'Alejandro García', '1995-06-12')], [
      af(10, 'Alex Garcia', '1995-06-12'),
      af(11, 'Alejandro Garcia', '1995-06-12'),
      af(12, 'John Smith', '1995-06-12'),
    ])

    expect(result.apiFootballPlayer?.id).toBe(11)
    expect(result.score).toBe(1)
  })

  it.each([
    {
      label: 'tied best score',
      transfermarkt: tm('1', 'Same Name', '2000-01-01'),
      candidates: [af(10, 'Same Name', '2000-01-01'), af(11, 'Same Name', '2000-01-01')],
      reason: 'tied_best_name_score',
    },
    {
      label: 'missing birth date',
      transfermarkt: tm('1', 'No Date', null),
      candidates: [af(10, 'No Date', '2000-01-01')],
      reason: 'missing_birth_date',
    },
    {
      label: 'no same-date candidate',
      transfermarkt: tm('1', 'No Candidate', '2000-01-01'),
      candidates: [af(10, 'No Candidate', '2001-01-01')],
      reason: 'no_birth_date_candidate',
    },
  ])('leaves $label unmatched', ({ transfermarkt, candidates, reason }) => {
    const [result] = matchPlayers([transfermarkt], candidates)

    expect(result.level).toBe('unmatched')
    expect(result.apiFootballPlayer).toBeNull()
    expect(result.reason).toBe(reason)
  })

  it('never assigns one API-Football player twice', () => {
    const results = matchPlayers(
      [tm('1', 'Alex Smith', '2000-01-01'), tm('2', 'Alex Smith', '2000-01-01')],
      [af(10, 'Alex Smith', '2000-01-01')],
    )

    expect(results.filter((result) => result.apiFootballPlayer?.id === 10)).toHaveLength(1)
    expect(results.map((result) => result.level)).toEqual(['matched', 'unmatched'])
  })
})
