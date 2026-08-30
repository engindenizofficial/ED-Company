import { apiFootballFetch } from '../api-football-client'

type ApiPlayerCore = {
  id: number
  name?: string
  firstname?: string
  lastname?: string
  age?: number
  birth?: { date?: string; place?: string; country?: string }
  nationality?: string
  height?: string
  weight?: string
  number?: number
  position?: string
  photo?: string
}

export type ApiPlayerDetail = {
  player: ApiPlayerCore
  statistics?: Array<{ team?: { id: number; name: string } }>
}

type PlayerProfileResponse = { player: ApiPlayerCore }
type PlayerFetcher = <T>(
  path: string,
  params: Record<string, string | number>,
  options: { cache: 'no-store' },
) => Promise<T[]>

function validBirthDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function withFallbackProfile(detail: ApiPlayerDetail, profile: ApiPlayerCore): ApiPlayerDetail {
  return {
    ...detail,
    player: {
      ...profile,
      ...detail.player,
      birth: validBirthDate(detail.player.birth?.date) ? detail.player.birth : profile.birth,
    },
  }
}

export async function fetchApiPlayerProfile(
  playerId: number,
  fetcher: PlayerFetcher = apiFootballFetch,
): Promise<ApiPlayerDetail> {
  const profiles = await fetcher<PlayerProfileResponse>(
    '/players/profiles',
    { player: playerId },
    { cache: 'no-store' },
  )
  const profile = profiles[0]?.player

  if (profile && validBirthDate(profile.birth?.date)) {
    return { player: profile }
  }

  const seasons = await fetcher<number>(
    '/players/seasons',
    { player: playerId },
    { cache: 'no-store' },
  )
  const uniqueSeasons = [...new Set(seasons.filter(Number.isInteger))].sort((a, b) => b - a)

  for (const season of uniqueSeasons) {
    const details = await fetcher<ApiPlayerDetail>(
      '/players',
      { id: playerId, season },
      { cache: 'no-store' },
    )
    const detail = details[0]
    if (detail && validBirthDate(detail.player?.birth?.date)) {
      return profile ? withFallbackProfile(detail, profile) : detail
    }
  }

  throw new Error(`Oyuncu profili veya geçerli doğum tarihi alınamadı (playerId=${playerId})`)
}

export function parseApiBirthDate(value: string | undefined): Date {
  if (!validBirthDate(value)) throw new Error(`Geçersiz oyuncu doğum tarihi: ${value ?? 'boş'}`)
  return new Date(`${value}T00:00:00.000Z`)
}
