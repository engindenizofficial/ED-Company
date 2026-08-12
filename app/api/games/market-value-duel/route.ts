import { NextResponse } from "next/server"
import { createDuelRound, resolveDuelRound, type DuelDifficulty } from "@/lib/games/market-value-duel"

export const dynamic = "force-dynamic"

const VALID_DIFFICULTIES: DuelDifficulty[] = ["easy", "normal", "hard"]

function parseDifficulty(value: string | null): DuelDifficulty {
  if (value && (VALID_DIFFICULTIES as string[]).includes(value)) return value as DuelDifficulty
  return "normal"
}

/** Yeni bir düello turu: 2 rastgele oyuncu (piyasa değeri GİZLİ) + imzalı jeton. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const difficulty = parseDifficulty(searchParams.get("difficulty"))

  const round = await createDuelRound(difficulty)
  if (!round) {
    return NextResponse.json(
      { error: "Yeterli oyuncu verisi bulunamadı. Lütfen daha sonra tekrar deneyin." },
      { status: 503 },
    )
  }
  return NextResponse.json(round)
}

/** Bir tahmini değerlendirir ve gerçek piyasa değerlerini açığa çıkarır. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = body?.token
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 })
  }

  const result = await resolveDuelRound(token)
  if (!result) {
    return NextResponse.json({ error: "Tur geçersiz veya süresi dolmuş." }, { status: 400 })
  }

  return NextResponse.json(result)
}
