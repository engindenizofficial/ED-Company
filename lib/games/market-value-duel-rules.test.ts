import { describe, expect, it } from 'vitest'
import { getIstanbulDayKey, marketValueDifference, scoreVerifiedAnswers, shouldFinishDuel, swipeSelection } from './market-value-duel-rules'

describe('market value duel rules', () => {
  it('uses the Europe/Istanbul calendar day', () => {
    expect(getIstanbulDayKey(new Date('2026-01-01T21:30:00.000Z'))).toBe('2026-01-02')
  })
  it('ends on the third mistake or tenth round', () => {
    expect(shouldFinishDuel(3, 0)).toBe(true)
    expect(shouldFinishDuel(10, 2)).toBe(true)
    expect(shouldFinishDuel(9, 1)).toBe(false)
  })
  it('handles percentage gaps without division by zero', () => {
    expect(marketValueDifference(150, 100)).toEqual({ absolute: 50, percentage: 50 })
    expect(marketValueDifference(100, 0)).toEqual({ absolute: 100, percentage: null })
    expect(marketValueDifference(null, 1)).toBeNull()
  })
  it('recomputes score and stops after three wrong answers', () => {
    expect(scoreVerifiedAnswers([
      { pickedId: 1, correctId: 1, speedSeconds: 5 },
      { pickedId: 2, correctId: 1 },
      { pickedId: null, correctId: 1 },
      { pickedId: 2, correctId: 1 },
      { pickedId: 1, correctId: 1 },
    ])).toEqual({ score: 150, correctCount: 1, remainingLives: 0, bestStreak: 1, playedRounds: 4 })
  })
  it('selects only intentional horizontal swipes', () => {
    expect(swipeSelection(-60, 10)).toBe('left')
    expect(swipeSelection(60, 10)).toBe('right')
    expect(swipeSelection(20, 80)).toBeNull()
  })
})
