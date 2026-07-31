import { NextResponse } from "next/server"
import type { PlayerPageData, PlayerProfile, PlayerSeasonStats, SidelinedEntry, Transfer, Trophy } from "@/lib/types"
import { currentSeason } from "@/lib/utils"

export const dynamic = "force-dynamic"

const BASE_URL = "https://v3.football.api-sports.io"

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return []
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.response as T[]) ?? []
  } catch {
    return []
  }
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get("playerId"))
  if (!playerId || isNaN(playerId)) {
    return NextResponse.json({ error: "playerId gerekli." }, { status: 400 })
  }

  const season = currentSeason()

  const [playerRaw, trophiesRaw, transfersRaw, sidelinedRaw] = await Promise.all([
    apiFetch<any>("/players", { id: playerId, season }),
    apiFetch<any>("/trophies", { player: playerId }),
    apiFetch<any>("/transfers", { player: playerId }),
    apiFetch<any>("/sidelined", { player: playerId }),
  ])

  if (!playerRaw || playerRaw.length === 0) {
    return NextResponse.json({ error: "Oyuncu bulunamadı." }, { status: 404 })
  }

  const entry = playerRaw[0]
  const p = entry.player ?? {}

  // Profile
  const currentStats = entry.statistics?.[0] ?? {}
  const profile: PlayerProfile = {
    id: p.id ?? 0,
    name: p.name ?? "",
    firstname: p.firstname ?? "",
    lastname: p.lastname ?? "",
    age: p.age ?? null,
    nationality: p.nationality ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    photo: p.photo ?? null,
    position: currentStats.games?.position ?? null,
    number: currentStats.games?.number ?? null,
    injured: p.injured ?? false,
    team: currentStats.team
      ? { id: currentStats.team.id, name: currentStats.team.name, logo: currentStats.team.logo ?? "" }
      : null,
    league: currentStats.league
      ? {
          id: currentStats.league.id,
          name: currentStats.league.name,
          country: currentStats.league.country,
          logo: currentStats.league.logo ?? "",
          season: currentStats.league.season,
        }
      : null,
  }

  // All seasons stats — fetch multiple seasons (last 5)
  const seasons = [season, season - 1, season - 2, season - 3, season - 4]
  const allSeasonRaw = await Promise.all(
    seasons.map((s) => apiFetch<any>("/players", { id: playerId, season: s }))
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
            country: stat.league?.country ?? "",
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
          // Shots
          shotsTotal: stat.shots?.total ?? null,
          shotsOn: stat.shots?.on ?? null,
          // Passes
          passesTotal: stat.passes?.total ?? null,
          passesKey: stat.passes?.key ?? null,
          passesAccuracy: stat.passes?.accuracy != null ? String(stat.passes.accuracy) : null,
          // Tackles
          tacklesTotal: stat.tackles?.total ?? null,
          interceptions: stat.tackles?.interceptions ?? null,
          blockedShots: stat.tackles?.blocks ?? null,
          // Duels
          duelsTotal: stat.duels?.total ?? null,
          duelsWon: stat.duels?.won ?? null,
          // Dribbles
          dribblesAttempted: stat.dribbles?.attempts ?? null,
          dribblesSuccess: stat.dribbles?.success ?? null,
          // Fouls
          foulsDrawn: stat.fouls?.drawn ?? null,
          foulsCommitted: stat.fouls?.committed ?? null,
          // Offsides
          offsides: stat.offsides ?? null,
          // Penalty
          penaltyWon: stat.penalty?.won ?? null,
          penaltyScored: stat.penalty?.scored ?? null,
          penaltyMissed: stat.penalty?.missed ?? null,
          penaltySaved: stat.penalty?.saved ?? null,
        })
      }
    }
  }

  // Deduplicate by season + team
  const seenStatKeys = new Set<string>()
  const uniqueStats = stats.filter((s) => {
    const key = `${s.season}-${s.team.id}-${s.league.id}`
    if (seenStatKeys.has(key)) return false
    seenStatKeys.add(key)
    return true
  })

  // Sort: newest season first
  uniqueStats.sort((a, b) => b.season - a.season)

  // Transfers
  const transfers: Transfer[] = (transfersRaw ?? [])
    .flatMap((entry: any) =>
      (entry.transfers ?? []).map((tx: any) => ({
        date: tx.date ?? null,
        type: tx.type ?? "",
        teamFrom: { id: tx.teams?.out?.id ?? 0, name: tx.teams?.out?.name ?? "", logo: tx.teams?.out?.logo ?? "" },
        teamTo: { id: tx.teams?.in?.id ?? 0, name: tx.teams?.in?.name ?? "", logo: tx.teams?.in?.logo ?? "" },
      }))
    )
    .sort((a: Transfer, b: Transfer) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 20)

  // Trophies
  const trophies: Trophy[] = (trophiesRaw ?? []).map((t: any) => ({
    league: t.league ?? "",
    country: t.country ?? "",
    season: t.season ?? "",
    place: t.place ?? "",
  }))

  // Sidelined / Injuries history
  const sidelined: SidelinedEntry[] = (sidelinedRaw ?? [])
    .map((s: any) => ({
      type: s.player?.reason ?? s.type ?? s.reason ?? "Bilinmiyor",
      start: s.start ?? null,
      end: s.end ?? null,
    }))
    .sort((a: SidelinedEntry, b: SidelinedEntry) =>
      (b.start ?? "").localeCompare(a.start ?? "")
    )

  const payload: PlayerPageData = {
    profile,
    stats: uniqueStats,
    transfers,
    trophies,
    sidelined,
    cachedAt: Date.now(),
  }

  return NextResponse.json(payload)
}
