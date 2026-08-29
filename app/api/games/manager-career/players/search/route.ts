import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    { results: [], error: "gameDataUnavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
