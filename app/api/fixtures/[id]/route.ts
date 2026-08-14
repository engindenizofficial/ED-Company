import { NextResponse } from "next/server"
import { getFixtureById } from "@/lib/api-football"

export const dynamic = "force-dynamic"

// /mac/[id] (paylaşılan link / direkt ziyaret) için: maç bugünün fikstür
// listesinde yoksa (örn. dünkü/yarınki bir maç) tek başına bu endpoint'ten
// çekilir. Ana akışta (bugünün listesi) bu endpoint hiç kullanılmaz.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fixtureId = Number(id)
  if (!fixtureId || isNaN(fixtureId)) {
    return NextResponse.json({ error: "missingFixtureId" }, { status: 400 })
  }

  const fixture = await getFixtureById(fixtureId)
  if (!fixture) {
    return NextResponse.json({ error: "fixtureNotFound" }, { status: 404 })
  }

  return NextResponse.json(fixture)
}
