import { NextRequest, NextResponse } from "next/server"
import { getPlayerNationality, getSquad } from "@/lib/api-football"
import { getPlayerMarketValuesByTeamIds } from "@/lib/search/market-index"
import { getFeaturedTeamsDirectory } from "@/lib/search/team-directory"
import { normalizeTR } from "@/lib/search/text-normalize"

export const dynamic = "force-dynamic"

export interface HomeSearchPlayerResult {
  id: number
  name: string
  photo: string | null
  nationality: string | null
  age: number | null
  teamId: number | null
  teamName: string | null
  teamLogo: string | null
  marketValueEur: number
}

function teamLogoUrl(teamId: number): string {
  return `https://media.api-sports.io/football/teams/${teamId}.png`
}

async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const directory = await getFeaturedTeamsDirectory()
  const teamById = new Map(directory.map((team) => [team.id, team]))
  const candidates = await getPlayerMarketValuesByTeamIds([...teamById.keys()])
  const qNorm = normalizeTR(q)

  const matches = candidates
    .filter((candidate) => normalizeTR(candidate.playerName).includes(qNorm))
    .sort((a, b) => {
      if (b.valueEur !== a.valueEur) return b.valueEur - a.valueEur
      return a.playerName.localeCompare(b.playerName, "tr")
    })
    .slice(0, 20)

  if (!matches.length) {
    return NextResponse.json({ results: [] })
  }

  const squadEntries = await mapWithConcurrency(
    [...new Set(matches.map((match) => match.teamId))],
    4,
    async (teamId) => {
      try {
        return [teamId, await getSquad(teamId)] as const
      } catch {
        return [teamId, []] as const
      }
    },
  )

  const squadInfoByPlayerId = new Map<number, { photo: string | null; age: number | null }>()
  for (const [, squad] of squadEntries) {
    for (const player of squad) {
      squadInfoByPlayerId.set(player.id, { photo: player.photo, age: player.age })
    }
  }

  const season = new Date().getFullYear()
  const nationalities = await mapWithConcurrency(matches, 4, async (match) => {
    try {
      return await getPlayerNationality(match.playerId, season)
    } catch {
      return null
    }
  })

  const results: HomeSearchPlayerResult[] = matches.map((match, index) => {
    const team = teamById.get(match.teamId)
    const squadInfo = squadInfoByPlayerId.get(match.playerId)

    return {
      id: match.playerId,
      name: match.playerName,
      photo: squadInfo?.photo ?? null,
      nationality: nationalities[index],
      age: squadInfo?.age ?? null,
      teamId: match.teamId,
      teamName: team?.name ?? null,
      teamLogo: team?.logo ?? teamLogoUrl(match.teamId),
      marketValueEur: match.valueEur,
    }
  })

  return NextResponse.json({ results })
}
