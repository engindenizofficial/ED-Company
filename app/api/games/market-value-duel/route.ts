import { NextResponse } from "next/server"
import { createDuelRound, resolveDuelRound, type DuelDifficulty } from "@/lib/games/market-value-duel"

export const dynamic = "force-dynamic"

const VALID_DIFFICULTIES: DuelDifficulty[] = ["easy", "normal", "hard"]

function parseDifficulty(value: string | null): DuelDifficulty {
  if (value && (VALID_DIFFICULTIES as string[]).includes(value)) return value as DuelDifficulty
  return "normal"
}

/**
 * "leagues" query parametresini ("39,140,135" gibi virgülle ayrılmış id
 * listesi) sayı dizisine çevirir. Geçersiz/eksik değer varsa `undefined`
 * döner — `createDuelRound` bunu "filtre yok, tüm ligler" olarak ele alır.
 * Gerçek doğrulama (sadece seçilebilir ulusal liglere izin verme) oyun
 * mantığı içinde `normalizeLeagueFilter` tarafından yapılır.
 */
function parseLeagueIds(value: string | null): number[] | undefined {
  if (!value) return undefined
  const ids = value
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
  return ids.length > 0 ? ids : undefined
}

/** Yeni bir düello turu: 2 rastgele oyuncu (piyasa değeri GİZLİ) + imzalı jeton. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const difficulty = parseDifficulty(searchParams.get("difficulty"))
  const leagueIds = parseLeagueIds(searchParams.get("leagues"))

  const round = await createDuelRound(difficulty, leagueIds)
  if (!round) {
    return NextResponse.json(
      { error: "notEnoughPlayers" },
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
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 })
  }

  const result = await resolveDuelRound(token)
  if (!result) {
    return NextResponse.json({ error: "roundExpired" }, { status: 400 })
  }

  return NextResponse.json(result)
}
