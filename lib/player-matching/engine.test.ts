import { describe, expect, it } from 'vitest'
import { matchPlayers } from './engine'
import { normalizeDate, normalizeText } from './normalize'
import { nameSimilarity } from './similarity'

const tm = (id: string, name: string, birthDate: string | null, teamName: string) => ({ id, name, birthDate, teamName })
const af = (id: number, name: string, birthDate: string | null, teamName: string) => ({ id, name, birthDate, teamName })

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

describe('three-level player matching', () => {
  it('matches same birth date and normalized team at level one', () => {
    const [result] = matchPlayers([tm('1', 'Mehmet Yılmaz', '2000-01-02', 'İstanbul FK')], [af(10, 'M. Yilmaz', '2000-01-02', 'Istanbul FK')])
    expect(result.level).toBe('exact_biographic')
    expect(result.apiFootballPlayer?.id).toBe(10)
  })

  it('uses fuzzy name and birth date at level two', () => {
    const [result] = matchPlayers([tm('1', 'João Pedro Silva', '1998-05-10', 'Old Club')], [af(10, 'Pedro Silva', '1998-05-10', 'New Club')])
    expect(result.level).toBe('fuzzy_name_birthdate')
  })

  it('leaves low scores, missing dates, and tied candidates unmatched', () => {
    const results = matchPlayers([
      tm('1', 'Completely Different', '1998-05-10', 'Old Club'),
      tm('2', 'No Date', null, 'Club'),
      tm('3', 'Same Name', '2000-01-01', 'Club'),
    ], [
      af(10, 'Other Person', '1998-05-10', 'New Club'),
      af(11, 'Same Name', '2000-01-01', 'Other'),
      af(12, 'Same Name', '2000-01-01', 'Another'),
    ])
    expect(results.map((result) => result.level)).toEqual(['unmatched', 'unmatched', 'unmatched'])
  })

  it('never assigns one API-Football player twice', () => {
    const results = matchPlayers([
      tm('1', 'Alex Smith', '2000-01-01', 'Club'),
      tm('2', 'Alex Smith', '2000-01-01', 'Club'),
    ], [af(10, 'Alex Smith', '2000-01-01', 'Club')])
    expect(results.filter((result) => result.apiFootballPlayer?.id === 10)).toHaveLength(1)
  })
})
