import { NextResponse } from "next/server"
import { getPlayerPageData } from "@/lib/api-football"
import { getCachedPlayer, setCachedPlayer } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const playerId = Number(id)
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "Geçersiz oyuncu ID'si." }, { status: 400 })
  }

  try {
    if (!refresh) {
      const cached = await getCachedPlayer(playerId)
      if (cached) return NextResponse.json(cached)
    }

    const data = await getPlayerPageData(playerId)
    if (!data) {
      return NextResponse.json({ error: "Oyuncu bulunamadı." }, { status: 404 })
    }

    await setCachedPlayer(playerId, data)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    console.log("[v0] player API failed:", message)

    const cached = await getCachedPlayer(playerId)
    if (cached) return NextResponse.json({ ...cached, stale: true })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
