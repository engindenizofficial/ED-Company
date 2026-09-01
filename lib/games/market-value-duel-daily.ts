import crypto, { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { marketValueDuelDailyResult, marketValueDuelDailyRound, user } from '@/lib/db/schema'
import { createDuelRound, resolveDuelRound, type DuelPlayer, type DuelRound } from './market-value-duel'
import { DUEL_TOTAL_ROUNDS, getIstanbulDayKey, scoreVerifiedAnswers } from './market-value-duel-rules'

export interface DailyAnswer { token: string; pickedId: number | null; speedSeconds?: number }
export interface DailyLeaderboardEntry { rank: number; name: string; score: number; correctCount: number; remainingLives: number; bestStreak: number; durationMs: number }
type DailyPayload = { dayKey: string; roundNumber: number; playerIds: [number, number]; startedAt: number }

function secret() { return process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET! }
function sign(payload: DailyPayload) { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}` }
function verify(token: string): DailyPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(signature); const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try { const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as DailyPayload; return value.dayKey && value.roundNumber > 0 ? value : null } catch { return null }
}

async function ensureRounds(dayKey: string) {
  let rows = await db.select().from(marketValueDuelDailyRound).where(eq(marketValueDuelDailyRound.dayKey, dayKey)).orderBy(asc(marketValueDuelDailyRound.roundNumber))
  if (rows.length === DUEL_TOTAL_ROUNDS) return rows
  const seen: number[] = []
  for (let number = 1; number <= DUEL_TOTAL_ROUNDS; number++) {
    const existing = rows.find((row) => row.roundNumber === number)
    if (existing) { seen.push(existing.leftPlayerId, existing.rightPlayerId); continue }
    const round = await createDuelRound('normal', undefined, seen)
    if (!round) throw new Error('notEnoughPlayers')
    seen.push(...round.players.map((player) => player.id))
    await db.insert(marketValueDuelDailyRound).values({ id: randomUUID(), dayKey, roundNumber: number, leftPlayerId: round.players[0].id, rightPlayerId: round.players[1].id, players: round.players }).onConflictDoNothing()
  }
  rows = await db.select().from(marketValueDuelDailyRound).where(eq(marketValueDuelDailyRound.dayKey, dayKey)).orderBy(asc(marketValueDuelDailyRound.roundNumber))
  return rows
}

export async function startDailyDuel(userId?: string) {
  const dayKey = getIstanbulDayKey()
  const previous = userId ? await db.select().from(marketValueDuelDailyResult).where(and(eq(marketValueDuelDailyResult.dayKey, dayKey), eq(marketValueDuelDailyResult.userId, userId))).limit(1) : []
  if (previous[0]) return { dayKey, alreadyPlayed: true, result: previous[0], leaderboard: await getDailyLeaderboard(dayKey) }
  const startedAt = Date.now()
  const rows = await ensureRounds(dayKey)
  const rounds: DuelRound[] = rows.map((row) => ({ players: row.players as [DuelPlayer, DuelPlayer], token: sign({ dayKey, roundNumber: row.roundNumber, playerIds: [row.leftPlayerId, row.rightPlayerId], startedAt }) }))
  return { dayKey, alreadyPlayed: false, rounds, leaderboard: userId ? await getDailyLeaderboard(dayKey) : [] }
}

export async function resolveDailyDuelRound(token: string) {
  const payload = verify(token)
  if (!payload || payload.dayKey !== getIstanbulDayKey()) return null
  const [row] = await db.select().from(marketValueDuelDailyRound).where(and(eq(marketValueDuelDailyRound.dayKey, payload.dayKey), eq(marketValueDuelDailyRound.roundNumber, payload.roundNumber))).limit(1)
  if (!row || row.leftPlayerId !== payload.playerIds[0] || row.rightPlayerId !== payload.playerIds[1]) return null
  return resolveDuelRound(signNormalToken(payload.playerIds))
}

export async function finishDailyDuel(userId: string, answers: DailyAnswer[]) {
  const dayKey = getIstanbulDayKey()
  const prior = await db.select().from(marketValueDuelDailyResult).where(and(eq(marketValueDuelDailyResult.dayKey, dayKey), eq(marketValueDuelDailyResult.userId, userId))).limit(1)
  if (prior[0]) return { result: prior[0], leaderboard: await getDailyLeaderboard(dayKey), alreadyPlayed: true }
  const payloads = answers.map((answer) => verify(answer.token))
  if (!answers.length || payloads.some((payload) => !payload || payload.dayKey !== dayKey)) throw new Error('invalidDailyAnswers')
  const rows = await db.select().from(marketValueDuelDailyRound).where(and(eq(marketValueDuelDailyRound.dayKey, dayKey), inArray(marketValueDuelDailyRound.roundNumber, payloads.map((payload) => payload!.roundNumber))))
  const verified = []
  for (let index = 0; index < answers.length; index++) {
    const payload = payloads[index]!
    const row = rows.find((item) => item.roundNumber === payload.roundNumber)
    if (!row || row.leftPlayerId !== payload.playerIds[0] || row.rightPlayerId !== payload.playerIds[1]) throw new Error('invalidDailyAnswers')
    const resolved = await resolveDuelRound(signNormalToken(payload.playerIds))
    if (!resolved) throw new Error('invalidDailyAnswers')
    verified.push({ pickedId: answers[index].pickedId, correctId: resolved.correctId, speedSeconds: answers[index].speedSeconds })
  }
  const score = scoreVerifiedAnswers(verified)
  const startedAt = new Date(Math.min(...payloads.map((payload) => payload!.startedAt)))
  const finishedAt = new Date()
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime())
  const [result] = await db.insert(marketValueDuelDailyResult).values({ id: randomUUID(), dayKey, userId, answers, score: score.score, correctCount: score.correctCount, remainingLives: score.remainingLives, bestStreak: score.bestStreak, durationMs, startedAt, finishedAt }).onConflictDoNothing().returning()
  const saved = result ?? (await db.select().from(marketValueDuelDailyResult).where(and(eq(marketValueDuelDailyResult.dayKey, dayKey), eq(marketValueDuelDailyResult.userId, userId))).limit(1))[0]
  return { result: saved, leaderboard: await getDailyLeaderboard(dayKey), alreadyPlayed: !result }
}

// Recreates the existing normal token format without exposing daily metadata to its resolver.
function signNormalToken(ids: [number, number]) { const body = Buffer.from(JSON.stringify(ids)).toString('base64url'); return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}` }

export async function getDailyLeaderboard(dayKey = getIstanbulDayKey()): Promise<DailyLeaderboardEntry[]> {
  const rows = await db.select({ name: user.name, score: marketValueDuelDailyResult.score, correctCount: marketValueDuelDailyResult.correctCount, remainingLives: marketValueDuelDailyResult.remainingLives, bestStreak: marketValueDuelDailyResult.bestStreak, durationMs: marketValueDuelDailyResult.durationMs }).from(marketValueDuelDailyResult).innerJoin(user, eq(user.id, marketValueDuelDailyResult.userId)).where(eq(marketValueDuelDailyResult.dayKey, dayKey)).orderBy(desc(marketValueDuelDailyResult.score), desc(marketValueDuelDailyResult.correctCount), desc(marketValueDuelDailyResult.remainingLives), asc(marketValueDuelDailyResult.durationMs), asc(marketValueDuelDailyResult.finishedAt)).limit(100)
  return rows.map((row, index) => ({ rank: index + 1, ...row }))
}
