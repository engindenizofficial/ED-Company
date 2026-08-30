import { describe, expect, it, vi } from 'vitest'
import { fetchApiPlayerProfile, parseApiBirthDate } from './api-football-player'

type Fetcher = Parameters<typeof fetchApiPlayerProfile>[1]

function mockFetcher(responses: Record<string, unknown[]>) {
  return vi.fn(async (path: string) => responses[path] ?? []) as unknown as Fetcher
}

describe('fetchApiPlayerProfile', () => {
  it('resolves Sacha Boey from the season-independent profile endpoint', async () => {
    const fetcher = mockFetcher({
      '/players/profiles': [{ player: { id: 2195, name: 'S. Boey', birth: { date: '2000-09-13' }, position: 'Defender' } }],
    })

    const result = await fetchApiPlayerProfile(2195, fetcher)

    expect(result.player).toMatchObject({ id: 2195, name: 'S. Boey', birth: { date: '2000-09-13' }, position: 'Defender' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls back through real seasons from newest to oldest', async () => {
    const fetcher = vi.fn(async (path: string, params: Record<string, string | number>) => {
      if (path === '/players/profiles') return [{ player: { id: 42, name: 'Profile Name' } }]
      if (path === '/players/seasons') return [2023, 2025, 2024, 2025]
      if (path === '/players' && params.season === 2025) return []
      if (path === '/players' && params.season === 2024) {
        return [{ player: { id: 42, name: 'Season Name', birth: { date: '1999-04-03' } }, statistics: [] }]
      }
      return []
    }) as unknown as Fetcher

    const result = await fetchApiPlayerProfile(42, fetcher)

    expect(result.player.name).toBe('Season Name')
    expect(result.player.birth?.date).toBe('1999-04-03')
    expect(fetcher).toHaveBeenNthCalledWith(3, '/players', { id: 42, season: 2025 }, { cache: 'no-store' })
    expect(fetcher).toHaveBeenNthCalledWith(4, '/players', { id: 42, season: 2024 }, { cache: 'no-store' })
  })

  it('rejects profiles when no valid birth date exists', async () => {
    const fetcher = mockFetcher({
      '/players/profiles': [{ player: { id: 7, birth: { date: 'not-a-date' } } }],
      '/players/seasons': [],
    })

    await expect(fetchApiPlayerProfile(7, fetcher)).rejects.toThrow('geçerli doğum tarihi alınamadı')
  })
})

describe('parseApiBirthDate', () => {
  it('parses a valid ISO calendar date', () => {
    expect(parseApiBirthDate('2000-09-13').toISOString()).toBe('2000-09-13T00:00:00.000Z')
  })

  it('rejects impossible calendar dates', () => {
    expect(() => parseApiBirthDate('2000-02-31')).toThrow('Geçersiz oyuncu doğum tarihi')
  })
})
