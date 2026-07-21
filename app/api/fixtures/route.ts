import { NextResponse } from "next/server"
import { getFixturesByDate } from "@/lib/api-football"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

  try {
    const fixtures = await getFixturesByDate(date)
    return NextResponse.json({ date, fixtures })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] fixtures error:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
