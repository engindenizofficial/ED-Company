import { NextResponse } from "next/server"
import { getEvents } from "@/lib/api-football"

export const dynamic = "force-dynamic"

// Kart-üstü gol kutlama animasyonu, golü atan oyuncunun adını ve fotoğrafını
// gösterebilmek için sadece bir gol olduğu anda, sadece o maç için bu
// endpoint'i çağırır. getEvents'in normal 30s cache'i burada BİLEREK atlanır
// (forceRefresh=true): aksi halde, aynı maçta art arda goller gelirse (örn.
// A takımının 2. golü), events endpoint'i hâlâ 30s öncesinin (sadece 1.
// golü içeren) cache'lenmiş halini döndürebilir ve animasyon 2. gol için
// yanlışlıkla 1. golü atan oyuncuyu gösterir. Bu endpoint sadece gol anında
// tetiklendiği için ek API yükü ihmal edilebilir düzeyde.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fixtureId = Number(id)
  if (!fixtureId || Number.isNaN(fixtureId)) {
    return NextResponse.json({ goals: [] }, { status: 400 })
  }

  try {
    const events = await getEvents(fixtureId, true)
    const goals = events
      .filter((e) => e.type === "Goal" && e.player)
      // API bazen olayları dakika sırasına göre değil geliş sırasına göre
      // döndürebiliyor. Takımın n'inci golünü index ile doğru seçebilmek
      // (bkz. goal-celebration-overlay.tsx) için burada dakikaya göre
      // (uzatma dakikası dahil) kronolojik sıraya sokuyoruz.
      .sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0))
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
