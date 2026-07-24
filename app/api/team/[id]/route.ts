import { NextResponse } from "next/server"

const BASE_URL = "https://v3.football.api-sports.io"

export const dynamic = "force-dynamic"
export const maxDuration = 30

async function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error("API_FOOTBALL_KEY tanımlı değil")
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const res = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`API-Football hata (${res.status})`)
  const json = await res.json()
  return json.response ?? []
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const teamId = Number(id)
  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "Geçersiz takım ID'si." }, { status: 400 })
  }

  try {
    const [teamRaw, fixturesRaw] = await Promise.all([
      apiFetch<any>("/teams", { id: teamId }),
      apiFetch<any>("/fixtures", { team: teamId, last: 10 }),
    ])

    if (teamRaw.length === 0) {
      return NextResponse.json({ error: "Takım bulunamadı." }, { status: 404 })
    }

    const t = teamRaw[0]
    const team = {
      id: t.team.id,
      name: t.team.name,
      logo: t.team.logo ?? null,
      country: t.team.country ?? null,
      founded: t.team.founded ?? null,
      national: t.team.national ?? false,
      venue: t.venue
        ? {
            name: t.venue.name ?? null,
            city: t.venue.city ?? null,
            capacity: t.venue.capacity ?? null,
            image: t.venue.image ?? null,
          }
        : null,
    }

    const fixtures = fixturesRaw.map((r: any) => ({
      id: r.fixture.id,
      date: r.fixture.date,
      statusShort: r.fixture.status.short,
      league: { id: r.league.id, name: r.league.name, logo: r.league.logo },
      home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
      away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
      goalsHome: r.goals.home,
      goalsAway: r.goals.away,
    }))

    return NextResponse.json({ team, fixtures })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
