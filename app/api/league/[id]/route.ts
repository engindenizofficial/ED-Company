import { NextResponse } from "next/server"
import { getLeaguePageData } from "@/lib/api-football"
import { getCachedLeague, setCachedLeague } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const leagueId = Number(id)
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"
  const season = searchParams.get("season") ? Number(searchParams.get("season")) : undefined

  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: "Geçersiz lig ID'si." }, { status: 400 })
  }

  const currentSeason =
    season ?? new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0)

  try {
    if (!refresh) {
      const cached = await getCachedLeague(leagueId, currentSeason)
      if (cached) return NextResponse.json(cached)
    }

    const data = await getLeaguePageData(leagueId, currentSeason)
    if (!data) {
      return NextResponse.json({ error: "Lig bulunamadı." }, { status: 404 })
    }

    await setCachedLeague(leagueId, currentSeason, data)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"

    const cached = await getCachedLeague(leagueId, currentSeason)
    if (cached) return NextResponse.json({ ...cached, stale: true })

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
