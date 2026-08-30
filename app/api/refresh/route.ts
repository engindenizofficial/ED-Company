import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { requireImportAdmin } from "@/lib/data-import/admin-access"
import { setCachedFixtures } from "@/lib/redis"
import type { FixturesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

export async function POST() {
  try {
    await requireImportAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const date = todayTR()

  try {
    const fixtures = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, cachedAt: Date.now() }
    await setCachedFixtures(date, payload)
    return NextResponse.json({
      ok: true,
      date,
      totalFixtures: fixtures.length,
      cachedAt: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: `Fikstürler çekilemedi: ${message}` }, { status: 502 })
  }
}
