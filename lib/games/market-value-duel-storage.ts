import type { DuelCareerStats } from '@/app/actions/market-value-duel'
import type { DuelDifficulty } from './market-value-duel'

const VERSION = 1
const STATS_KEY = 'ed0:market-value-duel:stats'
const DAILY_KEY = 'ed0:market-value-duel:daily'

type Store = { version: 1; scopes: Record<string, DuelCareerStats> }

function emptyStore(): Store { return { version: VERSION, scopes: {} } }
function scopeKey(difficulty: DuelDifficulty, leagueIds: number[]) { return `${difficulty}:${[...new Set(leagueIds)].sort((a, b) => a - b).join(',')}` }

export function readGuestDuelStats(storage: Pick<Storage, 'getItem'>, difficulty: DuelDifficulty, leagueIds: number[]) {
  try {
    const parsed = JSON.parse(storage.getItem(STATS_KEY) ?? '') as Store
    if (parsed.version !== VERSION || !parsed.scopes || typeof parsed.scopes !== 'object') return null
    const stats = parsed.scopes[scopeKey(difficulty, leagueIds)]
    return stats && Object.values(stats).every(Number.isFinite) ? stats : null
  } catch { return null }
}

export function mergeGuestDuelResult(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  input: { difficulty: DuelDifficulty; leagueIds: number[]; score: number; correctCount: number; answeredCount: number; bestStreak: number },
): DuelCareerStats {
  let store = emptyStore()
  try { const parsed = JSON.parse(storage.getItem(STATS_KEY) ?? '') as Store; if (parsed.version === VERSION && parsed.scopes) store = parsed } catch {}
  const key = scopeKey(input.difficulty, input.leagueIds)
  const old = store.scopes[key] ?? { gamesPlayed: 0, totalCorrect: 0, totalAnswers: 0, highScore: 0, bestStreak: 0, accuracy: 0 }
  const next = {
    gamesPlayed: old.gamesPlayed + 1,
    totalCorrect: old.totalCorrect + input.correctCount,
    totalAnswers: old.totalAnswers + input.answeredCount,
    highScore: Math.max(old.highScore, input.score),
    bestStreak: Math.max(old.bestStreak, input.bestStreak),
    accuracy: 0,
  }
  next.accuracy = next.totalAnswers ? Math.round(next.totalCorrect / next.totalAnswers * 100) : 0
  store.scopes[key] = next
  storage.setItem(STATS_KEY, JSON.stringify(store))
  return next
}

export function hasGuestDailyAttempt(storage: Pick<Storage, 'getItem'>, dayKey: string) {
  try { const parsed = JSON.parse(storage.getItem(DAILY_KEY) ?? 'null'); return parsed?.version === VERSION && parsed?.dayKey === dayKey && parsed?.completed === true } catch { return false }
}

export function markGuestDailyAttempt(storage: Pick<Storage, 'setItem'>, dayKey: string) {
  storage.setItem(DAILY_KEY, JSON.stringify({ version: VERSION, dayKey, completed: true }))
}
