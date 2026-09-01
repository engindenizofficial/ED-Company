import { describe, expect, it } from 'vitest'
import { hasGuestDailyAttempt, markGuestDailyAttempt, mergeGuestDuelResult, readGuestDuelStats } from './market-value-duel-storage'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
}

describe('guest duel storage', () => {
  it('merges scoped career stats and recovers from corrupt data', () => {
    const storage = memoryStorage()
    storage.setItem('ed0:market-value-duel:stats', '{broken')
    mergeGuestDuelResult(storage as Storage, { difficulty: 'normal', leagueIds: [39], score: 100, correctCount: 1, answeredCount: 2, bestStreak: 1 })
    const stats = mergeGuestDuelResult(storage as Storage, { difficulty: 'normal', leagueIds: [39], score: 200, correctCount: 2, answeredCount: 2, bestStreak: 2 })
    expect(stats).toMatchObject({ gamesPlayed: 2, totalCorrect: 3, totalAnswers: 4, highScore: 200, bestStreak: 2, accuracy: 75 })
    expect(readGuestDuelStats(storage as Storage, 'normal', [39])).toEqual(stats)
  })
  it('opens a new guest daily attempt when the Istanbul day changes', () => {
    const storage = memoryStorage()
    markGuestDailyAttempt(storage, '2026-09-01')
    expect(hasGuestDailyAttempt(storage, '2026-09-01')).toBe(true)
    expect(hasGuestDailyAttempt(storage, '2026-09-02')).toBe(false)
  })
})
