import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"
import { getMockFixtures } from "@/lib/mock-data"
import type { FixturesResponse } from "@/lib/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

  try {
    const fixtures = await getFixturesByDate(date)
    const payload: FixturesResponse = { date, fixtures, source: "live" }
    return NextResponse.json(payload)
  } catch (err) {
    // API down or key invalid -> serve backup data so the app keeps working.
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures API failed, serving mock data:", message)
    const payload: FixturesResponse = { date, fixtures: getMockFixtures(date), source: "mock" }
    return NextResponse.json(payload)
  }
}
