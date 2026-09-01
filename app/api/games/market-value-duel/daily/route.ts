import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { finishDailyDuel, getDailyDuelStatus, resolveDailyDuelRound, startDailyDuel, type DailyAnswer } from '@/lib/games/market-value-duel-daily'

export const dynamic = 'force-dynamic'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    const { searchParams } = new URL(request.url)
    return NextResponse.json(searchParams.get('view') === 'status' ? await getDailyDuelStatus(userId) : await startDailyDuel(userId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'dailyUnavailable' }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (typeof body?.token !== 'string') return NextResponse.json({ error: 'invalidRequest' }, { status: 400 })
  const result = await resolveDailyDuelRound(body.token)
  return result ? NextResponse.json(result) : NextResponse.json({ error: 'roundExpired' }, { status: 400 })
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'signInRequired' }, { status: 401 })
  const body = await request.json().catch(() => null) as { answers?: DailyAnswer[] } | null
  if (!Array.isArray(body?.answers) || body.answers.length > 10) return NextResponse.json({ error: 'invalidRequest' }, { status: 400 })
  try { return NextResponse.json(await finishDailyDuel(userId, body.answers)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'dailyUnavailable' }, { status: 400 }) }
}
