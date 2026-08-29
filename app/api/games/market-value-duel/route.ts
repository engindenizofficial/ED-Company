import { NextResponse } from "next/server"
import { getTransfermarktDuelPlayers } from "@/lib/data-import/snapshot-reader"

export const dynamic = "force-dynamic"

function unavailable() {
  return NextResponse.json(
    { error: "gameDataUnavailable", players: [] },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

async function duel() {
  const players = await getTransfermarktDuelPlayers(2)
  if (players.length !== 2) return unavailable()
  return NextResponse.json({ players }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET() {
  return duel()
}

export async function POST() {
  return duel()
}
