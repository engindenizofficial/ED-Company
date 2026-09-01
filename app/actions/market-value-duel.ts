'use server'

import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { marketValueDuelStats } from '@/lib/db/schema'
import type { DuelDifficulty } from '@/lib/games/market-value-duel'

const TOTAL_ROUNDS = 10
const MAX_SCORE = 2_000
const VALID_DIFFICULTIES = new Set<DuelDifficulty>(['easy', 'normal', 'hard'])

interface SaveDuelResultInput {
  difficulty: DuelDifficulty
  leagueIds: number[]
  score: number
  correctCount: number
  bestStreak: number
  answeredCount?: number
}

export interface DuelCareerStats {
  gamesPlayed: number
  totalCorrect: number
  totalAnswers: number
  highScore: number
  bestStreak: number
  accuracy: number
}

function normalizeLeagueScope(leagueIds: number[]): string {
  const normalized = Array.from(new Set(leagueIds))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b)
  if (normalized.length === 0 || normalized.length > 30) throw new Error('Invalid league selection')
  return normalized.join(',')
}

function validateResult(input: SaveDuelResultInput) {
  if (!VALID_DIFFICULTIES.has(input.difficulty)) throw new Error('Invalid difficulty')
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > MAX_SCORE) throw new Error('Invalid score')
  if (!Number.isInteger(input.correctCount) || input.correctCount < 0 || input.correctCount > TOTAL_ROUNDS) throw new Error('Invalid correct count')
  if (!Number.isInteger(input.bestStreak) || input.bestStreak < 0 || input.bestStreak > input.correctCount) throw new Error('Invalid streak')
}

export async function saveMarketValueDuelResult(input: SaveDuelResultInput): Promise<DuelCareerStats | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  validateResult(input)
  const leagueScope = normalizeLeagueScope(input.leagueIds)
  const now = new Date()
  const [stats] = await db
    .insert(marketValueDuelStats)
    .values({
      id: randomUUID(),
      userId: session.user.id,
      difficulty: input.difficulty,
      leagueScope,
      gamesPlayed: 1,
      totalCorrect: input.correctCount,
      totalAnswers: input.answeredCount ?? TOTAL_ROUNDS,
      highScore: input.score,
      bestStreak: input.bestStreak,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [marketValueDuelStats.userId, marketValueDuelStats.difficulty, marketValueDuelStats.leagueScope],
      set: {
        gamesPlayed: sql`${marketValueDuelStats.gamesPlayed} + 1`,
        totalCorrect: sql`${marketValueDuelStats.totalCorrect} + ${input.correctCount}`,
        totalAnswers: sql`${marketValueDuelStats.totalAnswers} + ${input.answeredCount ?? TOTAL_ROUNDS}`,
        highScore: sql`greatest(${marketValueDuelStats.highScore}, ${input.score})`,
        bestStreak: sql`greatest(${marketValueDuelStats.bestStreak}, ${input.bestStreak})`,
        updatedAt: now,
      },
    })
    .returning({
      gamesPlayed: marketValueDuelStats.gamesPlayed,
      totalCorrect: marketValueDuelStats.totalCorrect,
      totalAnswers: marketValueDuelStats.totalAnswers,
      highScore: marketValueDuelStats.highScore,
      bestStreak: marketValueDuelStats.bestStreak,
    })

  return {
    ...stats,
    accuracy: stats.totalAnswers > 0 ? Math.round((stats.totalCorrect / stats.totalAnswers) * 100) : 0,
  }
}
