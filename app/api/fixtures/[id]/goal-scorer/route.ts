import { NextResponse } from "next/server"
import { getEvents } from "@/lib/api-football"

export const dynamic = "force-dynamic"

// Kart-üstü gol kutlama animasyonu, golü atan oyuncunun adını ve fotoğrafını
// gösterebilmek için sadece bir gol olduğu anda, sadece o maç için bu
// endpoint'i çağırır (getEvents içindeki safeFetch zaten 30s cache'liyor,
// bu yüzden ek API yükü ihmal edilebilir düzeyde).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fixtureId = Number(id)
  if (!fixtureId || Number.isNaN(fixtureId)) {
    return NextResponse.json({ goals: [] }, { status: 400 })
  }

  try {
    const events = await getEvents(fixtureId)
    const goals = events
      .filter((e) => e.type === "Goal" && e.player)
      .map((e) => ({
        minute: e.minute,
        team: e.team,
        player: e.player,
        playerId: e.playerId,
        detail: e.detail,
      }))
    return NextResponse.json({ goals })
  } catch {
    return NextResponse.json({ goals: [] })
  }
}
