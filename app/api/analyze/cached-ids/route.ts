import { NextResponse } from "next/server"
import { getCachedFixtureIds } from "@/lib/redis"

export const dynamic = "force-dynamic"

// POST /api/analyze/cached-ids
// Body: { ids: number[] }
// Returns: { cachedIds: number[] }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Boolean) : []
    if (ids.length === 0) return NextResponse.json({ cachedIds: [] })
    const cachedIds = await getCachedFixtureIds(ids)
    return NextResponse.json({ cachedIds })
  } catch (err) {
    console.log("[v0] cached-ids error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ cachedIds: [] })
  }
}
