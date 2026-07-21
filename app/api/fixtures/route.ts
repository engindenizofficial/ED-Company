import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import type { FixturesResponse } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

  try {
    const fixtures = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, source: "live" }
    return NextResponse.json(payload)
  } catch (err) {
    // API down, key invalid or rate limit hit. Do NOT invent fake matches —
    // signal the failure so the client keeps showing the last real data it
    // already pulled from the API.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
