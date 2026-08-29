import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function unavailable() {
  return NextResponse.json(
    { error: "gameDataUnavailable", players: [] },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET() {
  return unavailable()
}

export async function POST() {
  return unavailable()
}
