export const DUEL_TOTAL_ROUNDS = 10
const DUEL_MAX_LIVES = 3

export interface VerifiedDuelScore {
  score: number
  correctCount: number
  remainingLives: number
  bestStreak: number
  playedRounds: number
}

export function getIstanbulDayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function shouldFinishDuel(round: number, lives: number): boolean {
  return round >= DUEL_TOTAL_ROUNDS || lives <= 0
}

export function marketValueDifference(left: number | null, right: number | null) {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) return null
  const absolute = Math.abs(left - right)
  const lower = Math.min(left, right)
  return { absolute, percentage: lower > 0 ? Math.round((absolute / lower) * 100) : null }
}

export function scoreVerifiedAnswers(
  answers: Array<{ pickedId: number | null; correctId: number; speedSeconds?: number }>,
): VerifiedDuelScore {
  let lives = DUEL_MAX_LIVES
  let score = 0
  let correctCount = 0
  let streak = 0
  let bestStreak = 0
  let playedRounds = 0
  for (const answer of answers.slice(0, DUEL_TOTAL_ROUNDS)) {
    if (lives <= 0) break
    playedRounds++
    if (answer.pickedId === answer.correctId) {
      correctCount++
      streak++
      bestStreak = Math.max(bestStreak, streak)
      score += 100 + Math.max(0, Math.min(10, Math.trunc(answer.speedSeconds ?? 0))) * 10
    } else {
      lives--
      streak = 0
    }
  }
  return { score, correctCount, remainingLives: lives, bestStreak, playedRounds }
}

export function swipeSelection(deltaX: number, deltaY: number, threshold = 48): 'left' | 'right' | null {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return null
  return deltaX < 0 ? 'left' : 'right'
}
