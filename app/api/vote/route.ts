import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { castVote, getVoteCounts, getVoterChoice } from "@/lib/redis"
import type { VoteChoice, VoteState } from "@/lib/types"

export const dynamic = "force-dynamic"

const VOTER_COOKIE = "ed_vid"
// 1 yıl — anonim oy verenlerin kimliğini uzun süre hatırlamak için
const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function isValidChoice(value: unknown): value is VoteChoice {
  return value === "home" || value === "draw" || value === "away"
}

function total(counts: { home: number; draw: number; away: number }): number {
  return counts.home + counts.draw + counts.away
}

// Mevcut oy durumunu döndürür — henüz kimliği olmayan ziyaretçiler için
// oy vermeye zorlamadan sadece güncel yüzdeleri gösterir.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get("fixtureId"))
  if (!Number.isFinite(fixtureId)) {
    return NextResponse.json({ error: "Geçersiz fixtureId" }, { status: 400 })
  }

  const cookieStore = await cookies()
  const voterId = cookieStore.get(VOTER_COOKIE)?.value ?? null

  const counts = await getVoteCounts(fixtureId)
  const myVote = voterId ? await getVoterChoice(fixtureId, voterId) : null

  const state: VoteState = { fixtureId, counts, total: total(counts), myVote }
  return NextResponse.json(state)
}

// Tek tıkla oy verme — üye olsun olmasın herkes kullanabilir.
// Ziyaretçi kimliği bir çerezle takip edilir; aynı kişi bir maça yalnızca
// bir kez oy verebilir.
export async function POST(request: Request) {
  let body: { fixtureId?: number; choice?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 })
  }

  const fixtureId = Number(body.fixtureId)
  if (!Number.isFinite(fixtureId)) {
    return NextResponse.json({ error: "Geçersiz fixtureId" }, { status: 400 })
  }
  if (!isValidChoice(body.choice)) {
    return NextResponse.json({ error: "Geçersiz seçim" }, { status: 400 })
  }

  const cookieStore = await cookies()
  let voterId = cookieStore.get(VOTER_COOKIE)?.value
  const isNewVoter = !voterId
  if (!voterId) {
    voterId = crypto.randomUUID()
  }

  const { counts, myVote } = await castVote(fixtureId, voterId, body.choice)
  const state: VoteState = { fixtureId, counts, total: total(counts), myVote }

  const response = NextResponse.json(state)
  if (isNewVoter) {
    response.cookies.set(VOTER_COOKIE, voterId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VOTER_COOKIE_MAX_AGE,
    })
  }
  return response
}
