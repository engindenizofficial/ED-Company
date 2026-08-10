import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type { PlayerSeasonStats, SidelinedEntry, Transfer, Trophy } from "@/lib/types"

export const dynamic = "force-dynamic"

// Oyuncu panelindeki her sekme kendi verisini, sadece o sekmeye tıklandığında
// bu endpoint üzerinden ayrı ayrı çeker. Böylece panel açılışında birden fazla
// endpoint aynı anda çekilmiyor; her sekme yalnızca ihtiyacı olan endpoint(ler)i
// tetikliyor. Alttaki safeApiFootballFetch ayrıca kısa süreli cache içeriyor,
// bu yüzden "Sezon İstatistikleri" ve "Kariyer Özeti" sekmeleri aynı veriyi
// paylaşırken de ekstra istek yaratmıyor.
const VALID_SECTIONS = ["stats", "trophies", "transfers", "sidelined"] as const
type Section = (typeof VALID_SECTIONS)[number]

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

async function fetchSeasonStats(playerId: number): Promise<PlayerSeasonStats[]> {
  const season = currentSeason()
  const seasons = [season, season - 1, season - 2, season - 3, season - 4]
  const allSeasonRaw = await Promise.all(
    seasons.map((s) => apiFetch<any>("/players", { id: playerId, season: s })),
  )

  const stats: PlayerSeasonStats[] = []
  for (const seasonData of allSeasonRaw) {
    for (const se of seasonData) {
      for (const stat of se.statistics ?? []) {
        if (!stat.team?.id) continue
        stats.push({
          season: stat.league?.season ?? 0,
          team: { id: stat.team.id, name: stat.team.name, logo: stat.team.logo ?? "" },
          league: {
            id: stat.league?.id ?? 0,
            name: stat.league?.name ?? "",
            country: toTurkishCountry(stat.league?.country ?? ""),
            logo: stat.league?.logo ?? "",
          },
          appearances: stat.games?.appearences ?? null,
          lineups: stat.games?.lineups ?? null,
          minutes: stat.games?.minutes ?? null,
          goals: stat.goals?.total ?? null,
          assists: stat.goals?.assists ?? null,
          yellowCards: stat.cards?.yellow ?? null,
          redCards: stat.cards?.red ?? null,
          yellowRedCards: stat.cards?.yellowred ?? null,
          rating: stat.games?.rating ?? null,
          shotsTotal: stat.shots?.total ?? null,
          shotsOn: stat.shots?.on ?? null,
          passesTotal: stat.passes?.total ?? null,
          passesKey: stat.passes?.key ?? null,
          passesAccuracy: stat.passes?.accuracy != null ? String(stat.passes.accuracy) : null,
          tacklesTotal: stat.tackles?.total ?? null,
          interceptions: stat.tackles?.interceptions ?? null,
          blockedShots: stat.tackles?.blocks ?? null,
          duelsTotal: stat.duels?.total ?? null,
          duelsWon: stat.duels?.won ?? null,
          dribblesAttempted: stat.dribbles?.attempts ?? null,
          dribblesSuccess: stat.dribbles?.success ?? null,
          foulsDrawn: stat.fouls?.drawn ?? null,
          foulsCommitted: stat.fouls?.committed ?? null,
          offsides: stat.offsides ?? null,
          penaltyWon: stat.penalty?.won ?? null,
          penaltyScored: stat.penalty?.scored ?? null,
          penaltyMissed: stat.penalty?.missed ?? null,
          penaltySaved: stat.penalty?.saved ?? null,
        })
      }
    }
  }

  const seenStatKeys = new Set<string>()
  const uniqueStats = stats.filter((s) => {
    const key = `${s.season}-${s.team.id}-${s.league.id}`
    if (seenStatKeys.has(key)) return false
    seenStatKeys.add(key)
    return true
  })

  uniqueStats.sort((a, b) => b.season - a.season)
  return uniqueStats
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get("playerId"))
  const section = searchParams.get("section") as Section | null

  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "playerId gerekli." }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "Geçersiz sekme." }, { status: 400 })
  }

  try {
    switch (section) {
      case "stats": {
        const data = await fetchSeasonStats(playerId)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "trophies": {
        const trophiesRaw = await apiFetch<any>("/trophies", { player: playerId })
        const data: Trophy[] = (trophiesRaw ?? []).map((t: any) => ({
          league: t.league ?? "",
          country: toTurkishCountry(t.country ?? ""),
          season: t.season ?? "",
          place: t.place ?? "",
        }))
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "transfers": {
        const transfersRaw = await apiFetch<any>("/transfers", { player: playerId })
        const data: Transfer[] = (transfersRaw ?? [])
          .flatMap((entry: any) =>
            (entry.transfers ?? []).map((tx: any) => ({
              date: tx.date ?? null,
              type: tx.type ?? "",
              teamFrom: { id: tx.teams?.out?.id ?? 0, name: tx.teams?.out?.name ?? "", logo: tx.teams?.out?.logo ?? "" },
              teamTo: { id: tx.teams?.in?.id ?? 0, name: tx.teams?.in?.name ?? "", logo: tx.teams?.in?.logo ?? "" },
            })),
          )
          .sort((a: Transfer, b: Transfer) => (b.date ?? "").localeCompare(a.date ?? ""))
          .slice(0, 20)
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }

      case "sidelined": {
        const sidelinedRaw = await apiFetch<any>("/sidelined", { player: playerId })
        const data: SidelinedEntry[] = (sidelinedRaw ?? [])
          .map((s: any) => ({
            type: s.player?.reason ?? s.type ?? s.reason ?? "Bilinmiyor",
            start: s.start ?? null,
            end: s.end ?? null,
          }))
          .sort((a: SidelinedEntry, b: SidelinedEntry) => (b.start ?? "").localeCompare(a.start ?? ""))
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
