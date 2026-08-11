import { NextResponse } from "next/server"
import { safeApiFootballFetch } from "@/lib/api-football-client"
import { toTurkishCountry } from "@/lib/tr-aliases"
import { getPlayerMarketValues } from "@/lib/market-values"
import type {
  Fixture,
  FormGame,
  SquadPlayer,
  StandingRow,
  TeamCoach,
  TeamFormData,
  TeamStatsSummary,
  TeamTopScorer,
  TeamTransfer,
} from "@/lib/types"

export const dynamic = "force-dynamic"

// Takım panelindeki her sekme kendi verisini, sadece o sekmeye tıklandığında
// bu endpoint üzerinden ayrı ayrı çeker. Böylece panel açılışında 9 endpoint
// birden aynı anda çekilmiyor; her sekme yalnızca ihtiyacı olan endpoint(ler)i
// tetikliyor. Alttaki safeApiFootballFetch ayrıca kısa süreli cache içeriyor,
// bu yüzden aynı sekmeyi art arda açıp kapatmak da ekstra istek yaratmıyor.
const VALID_SECTIONS = [
  "stats",
  "form",
  "coach",
  "fixtures",
  "squad",
  "topScorers",
  "standings",
  "transfers",
] as const
type Section = (typeof VALID_SECTIONS)[number]

function apiFetch<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  return safeApiFootballFetch<T>(path, params, { cache: "no-store" })
}

// safeApiFootballFetch her zaman T[] tipinde döner, ancak API-Football'da
// bazı endpoint'ler ("/teams/statistics" gibi) "response" alanında dizi değil
// tek bir obje döndürür. Bu yardımcı, o durumda [0] ile yanlış indeksleme
// yapmadan objeyi doğrudan kullanmamızı sağlıyor.
async function apiFetchObject<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
  const raw = await safeApiFootballFetch<T>(path, params, { cache: "no-store" })
  return (raw as unknown as T) ?? null
}

function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v)
  return isFinite(n) ? n : 0
}

interface RawFixture {
  fixture: {
    id: number; date: string; timestamp: number
    status: { long: string; short: string; elapsed: number | null; extra?: number | null }
    venue: { name: string | null }
  }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

function mapFixture(r: RawFixture): Fixture {
  return {
    id: r.fixture.id, date: r.fixture.date, timestamp: r.fixture.timestamp,
    status: r.fixture.status.long, statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null, elapsedExtra: r.fixture.status.extra ?? null, venue: r.fixture.venue?.name ?? null,
    league: { id: r.league.id, name: r.league.name, country: toTurkishCountry(r.league.country), logo: r.league.logo, season: r.league.season, round: r.league.round },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home, goalsAway: r.goals.away,
    referee: null,
    refereeCountry: null,
  }
}

async function fetchFinishedFixtures(teamId: number): Promise<RawFixture[]> {
  const raw = await apiFetch<RawFixture>("/fixtures", { team: teamId, last: 15 })
  return [...(raw ?? [])]
    .filter(r => /FT|AET|PEN/.test(r.fixture.status.short))
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
}

// API-Football'un /teams/statistics endpoint'i "league" parametresini zorunlu
// tutuyor (team + season yeterli değil, "The League field is required." hatası
// döner). Bu yüzden önce takımın bu sezon oynadığı ligi standings üzerinden
// buluyoruz (topScorers sekmesindeki mantıkla aynı).
async function fetchCurrentLeagueId(teamId: number, season: number): Promise<number | null> {
  const standingsRaw = await apiFetch<any>("/standings", { team: teamId, season })
  return standingsRaw?.[0]?.league?.id ?? null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamId = Number(searchParams.get("teamId"))
  const section = searchParams.get("section") as Section | null

  if (!teamId || isNaN(teamId)) {
    return NextResponse.json({ error: "teamId gerekli." }, { status: 400 })
  }
  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "Geçersiz sekme." }, { status: 400 })
  }

  const season = currentSeason()

  try {
    switch (section) {
      case "stats": {
        const leagueId = await fetchCurrentLeagueId(teamId, season)
        if (!leagueId) return NextResponse.json({ data: null })
        // NOT: /teams/statistics tek bir obje döner (dizi değil), bu yüzden
        // diğer endpoint'lerdeki gibi [0] ile indekslemiyoruz.
        const s = (await apiFetchObject<any>("/teams/statistics", { team: teamId, season, league: leagueId })) as any
        if (!s?.fixtures) return NextResponse.json({ data: null })
        const data: TeamStatsSummary = {
          team: { id: teamId, name: "", logo: "" },
          formString: (s.form ?? "").slice(-8),
          played: num(s.fixtures?.played?.total),
          wins: num(s.fixtures?.wins?.total),
          draws: num(s.fixtures?.draws?.total),
          losses: num(s.fixtures?.loses?.total),
          goalsForAvg: num(s.goals?.for?.average?.total),
          goalsAgainstAvg: num(s.goals?.against?.average?.total),
          cleanSheets: num(s.clean_sheet?.total),
          failedToScore: num(s.failed_to_score?.total),
        }
        return NextResponse.json({ data })
      }

      case "form": {
        const leagueId = await fetchCurrentLeagueId(teamId, season)
        const [s, finished] = await Promise.all([
          leagueId
            ? (apiFetchObject<any>("/teams/statistics", { team: teamId, season, league: leagueId }) as Promise<any>)
            : Promise.resolve(null),
          fetchFinishedFixtures(teamId),
        ])
        const recent: FormGame[] = finished.slice(0, 6).map(r => {
          const isHome = r.teams.home.id === teamId
          const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
          const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
          const opponent = isHome ? r.teams.away.name : r.teams.home.name
          const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
          return { opponent, scored, conceded, result, home: isHome, date: r.fixture.date }
        })
        const formString: string = (s?.form ?? "").slice(-6)
        if (recent.length === 0 && formString.length === 0) return NextResponse.json({ data: null })
        const data: TeamFormData = { recent, formString }
        return NextResponse.json({ data })
      }

      case "fixtures": {
        const finished = await fetchFinishedFixtures(teamId)
        if (finished.length === 0) return NextResponse.json({ data: null })
        const data: Fixture[] = finished.slice(0, 15).map(mapFixture)
        return NextResponse.json({ data })
      }

      case "coach": {
        const coachRaw = await apiFetch<any>("/coachs", { team: teamId })
        // Sadece bu takımda end=null VE en geç start tarihine sahip olan seçilir.
        // Fallback yok: aktif kayıt yoksa null döner (yanlış antrenör gösterilmez).
        const activeForTeam = (coachRaw ?? []).filter((c: any) =>
          (c.career ?? []).some((j: any) => j.team?.id === teamId && !j.end)
        )
        const currentCoachRaw = activeForTeam.sort((a: any, b: any) => {
          const aStart = (a.career ?? []).find((j: any) => j.team?.id === teamId && !j.end)?.start ?? ""
          const bStart = (b.career ?? []).find((j: any) => j.team?.id === teamId && !j.end)?.start ?? ""
          return bStart.localeCompare(aStart)
        })[0] ?? null

        if (!currentCoachRaw) return NextResponse.json({ data: null })
        const data: TeamCoach = {
          id: currentCoachRaw.id,
          name: currentCoachRaw.name ?? "",
          photo: currentCoachRaw.photo ?? null,
          nationality: currentCoachRaw.nationality ?? null,
          age: currentCoachRaw.age ?? null,
          career: (currentCoachRaw.career ?? []).slice(-5).map((j: any) => ({
            team: { id: j.team?.id, name: j.team?.name ?? "", logo: j.team?.logo ?? "" },
            start: j.start ?? null,
            end: j.end ?? null,
          })),
        }
        return NextResponse.json({ data })
      }

      case "squad": {
        const squadRaw = await apiFetch<any>("/players/squads", { team: teamId })
        const squadData = squadRaw?.[0] as any
        const rawPlayers = squadData?.players ?? []

        // Piyasa değerleri veritabanından tek sorguda okunur (cron tarafından
        // haftalık dolduruluyor); burada asla canlı scrape tetiklenmez.
        const playerIds: number[] = rawPlayers.map((p: any) => p.id).filter(Boolean)
        const marketValues = await getPlayerMarketValues(playerIds).catch(() => new Map())

        const players: SquadPlayer[] = rawPlayers.map((p: any) => {
          const mv = marketValues.get(p.id)
          return {
            id: p.id, name: p.name, age: p.age ?? null,
            number: p.number ?? null, pos: p.position ?? null, photo: p.photo ?? null,
            marketValueEur: mv?.matchStatus === "matched" ? mv.valueEur : null,
          }
        })
        if (players.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data: players })
      }

      case "standings": {
        const standingsRaw = await apiFetch<any>("/standings", { team: teamId, season })
        const standings: StandingRow[] = []
        const seenStandingKeys = new Set<string>()
        for (const entry of standingsRaw ?? []) {
          const leagueName: string = entry?.league?.name ?? ""
          const groups: any[][] = entry?.league?.standings ?? []
          for (const group of groups) {
            for (const row of group) {
              const sKey = `${row.team?.id ?? 0}-${leagueName}`
              if (seenStandingKeys.has(sKey)) continue
              seenStandingKeys.add(sKey)
              const groupLabel = groups.length > 1 && row.group ? row.group : leagueName
              standings.push({
                rank: row.rank, team: row.team?.name ?? "", teamId: row.team?.id ?? 0,
                teamLogo: row.team?.logo ?? "",
                points: row.points ?? 0, played: row.all?.played ?? 0,
                win: row.all?.win ?? 0, draw: row.all?.draw ?? 0, lose: row.all?.lose ?? 0,
                goalsFor: row.all?.goals?.for ?? 0, goalsAgainst: row.all?.goals?.against ?? 0,
                form: row.form ?? null, group: groupLabel,
              })
            }
          }
        }
        if (standings.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data: standings })
      }

      case "transfers": {
        const transfersRaw = await apiFetch<any>("/transfers", { team: teamId })
        const seenTransferKeys = new Set<string>()
        const allTransfers: TeamTransfer[] = []
        for (const entry of transfersRaw ?? []) {
          const player = entry.player ?? {}
          const normalName = (player.name ?? "").toLowerCase().replace(/\s+/g, "")
          for (const tx of entry.transfers ?? []) {
            const fromId = tx.teams?.out?.id ?? 0
            const toId = tx.teams?.in?.id ?? 0
            const pairKey = [fromId, toId].sort((a, b) => a - b).join("-")
            const key = `${normalName}-${tx.date ?? ""}-${pairKey}`
            if (seenTransferKeys.has(key)) continue
            seenTransferKeys.add(key)
            allTransfers.push({
              date: tx.date ?? null,
              type: tx.type ?? "",
              teamFrom: { id: fromId, name: tx.teams?.out?.name ?? "", logo: tx.teams?.out?.logo ?? "" },
              teamTo: { id: toId, name: tx.teams?.in?.name ?? "", logo: tx.teams?.in?.logo ?? "" },
              player: { id: player.id ?? 0, name: player.name ?? "", photo: player.photo ?? null },
            })
          }
        }
        if (allTransfers.length === 0) return NextResponse.json({ data: null })
        const data = allTransfers
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
          .slice(0, 25)
        return NextResponse.json({ data })
      }

      case "topScorers": {
        // Gol krallığı için önce takımın oynadığı ligi bulmamız gerekiyor (standings çağrısı,
        // kısa süreli cache sayesinde "standings" sekmesiyle aynı isteği paylaşabilir).
        const standingsRaw = await apiFetch<any>("/standings", { team: teamId, season })
        const leagueId = standingsRaw?.[0]?.league?.id
        if (!leagueId) return NextResponse.json({ data: null })
        const leagueTopScorers = await apiFetch<any>("/players/topscorers", { league: leagueId, season })
        const data: TeamTopScorer[] = (leagueTopScorers ?? []).slice(0, 10).map((entry: any) => ({
          player: { id: entry.player?.id ?? 0, name: entry.player?.name ?? "", photo: entry.player?.photo ?? null },
          goals: entry.statistics?.[0]?.goals?.total ?? 0,
          assists: entry.statistics?.[0]?.goals?.assists ?? 0,
          appearances: entry.statistics?.[0]?.games?.appearences ?? 0,
          rating: entry.statistics?.[0]?.games?.rating ?? null,
          yellowCards: entry.statistics?.[0]?.cards?.yellow ?? 0,
          redCards: entry.statistics?.[0]?.cards?.red ?? 0,
          pos: entry.statistics?.[0]?.games?.position ?? null,
        }))
        if (data.length === 0) return NextResponse.json({ data: null })
        return NextResponse.json({ data })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
