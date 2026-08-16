"use server"

import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { managerCareer, managerFixture } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { getStandings, currentSeason } from "@/lib/api-football"
import { buildDoubleRoundRobinCalendar, type RoundRobinTeam } from "@/lib/games/manager-fixtures"
import {
  getOrComputeTeamStrength,
  getRealTeamRoster,
  getUserSquadRoster,
  type RosterPlayer,
  type TeamStrength,
} from "@/lib/games/team-strength"
import { groupStrengthFromRoster } from "@/lib/games/opponent-roster"
import { simulateMatch, applyDifficultyToStrength, type MatchEvent } from "@/lib/games/match-simulation"

/** Bkz. app/actions/manager-career.ts — aynı admin-only erişim deseni. */
async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  if (!isAdminEmail(session.user.email)) throw new Error("Unauthorized")
  return session.user.id
}

export interface FixtureSummary {
  id: string
  matchday: number
  homeTeamId: number | null
  homeTeamName: string
  homeTeamLogo: string | null
  awayTeamId: number | null
  awayTeamName: string
  awayTeamLogo: string | null
  isUserMatch: boolean
  status: "scheduled" | "played"
  homeGoals: number | null
  awayGoals: number | null
}

export interface LeagueTableRow {
  /** null => kullanıcının kulübü */
  teamId: number | null
  teamName: string
  teamLogo: string | null
  isUser: boolean
  played: number
  win: number
  draw: number
  lose: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface CareerHomeData {
  clubName: string
  logoFile: string
  formation: string
  leagueId: number
  status: "building" | "active"
  nextFixture: FixtureSummary | null
  totalMatchdays: number
  matchdaysPlayed: number
}

export interface PlayedMatchResult {
  fixtureId: string
  homeTeamName: string
  homeTeamLogo: string | null
  awayTeamName: string
  awayTeamLogo: string | null
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
}

export type PlayNextFixtureResult =
  | { ok: false; error: string }
  | { ok: true; seasonComplete: true; table: LeagueTableRow[] }
  | { ok: true; seasonComplete: false; userMatch: PlayedMatchResult; table: LeagueTableRow[]; nextFixture: FixtureSummary | null }

function toFixtureSummary(row: typeof managerFixture.$inferSelect): FixtureSummary {
  return {
    id: row.id,
    matchday: row.matchday,
    homeTeamId: row.homeTeamId,
    homeTeamName: row.homeTeamName,
    homeTeamLogo: row.homeTeamLogo,
    awayTeamId: row.awayTeamId,
    awayTeamName: row.awayTeamName,
    awayTeamLogo: row.awayTeamLogo,
    isUserMatch: row.isUserMatch,
    status: row.status as "scheduled" | "played",
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
  }
}

/**
 * Bir kariyer için sezon fikstürünü üretir — İDEMPOTENT: zaten fikstür varsa
 * hiçbir şey yapmaz. Seçilen ligdeki gerçek takımlar (bkz. getStandings) +
 * kullanıcının kulübü, çift devreli round-robin ile TEK bir takvimde
 * birleştirilir.
 */
export async function generateSeasonFixtures(careerId: string): Promise<void> {
  const existing = await db.select({ id: managerFixture.id }).from(managerFixture).where(eq(managerFixture.careerId, careerId)).limit(1)
  if (existing.length > 0) return

  const careerRows = await db.select().from(managerCareer).where(eq(managerCareer.id, careerId)).limit(1)
  if (careerRows.length === 0) return
  const career = careerRows[0]

  const standings = await getStandings(career.leagueId, currentSeason(), [])
  const uniqueRealTeams = new Map<number, RoundRobinTeam>()
  for (const row of standings) {
    if (row.teamId && !uniqueRealTeams.has(row.teamId)) {
      uniqueRealTeams.set(row.teamId, { id: row.teamId, name: row.team, logo: row.teamLogo || null })
    }
  }
  // Standings API'den hiç takım gelmediyse (geçici hata) burada durup bir
  // sonraki çağrıda (bkz. getMyCareerHome, playNextFixture) yeniden denenir.
  if (uniqueRealTeams.size === 0) return

  const userTeam: RoundRobinTeam = { id: null, name: career.clubName, logo: `/images/manager-logos/${career.logoFile}` }
  const calendar = buildDoubleRoundRobinCalendar([...uniqueRealTeams.values(), userTeam])
  if (calendar.length === 0) return

  await db.insert(managerFixture).values(
    calendar.map((f) => ({
      id: crypto.randomUUID(),
      careerId,
      matchday: f.matchday,
      homeTeamId: f.home.id,
      homeTeamName: f.home.name,
      homeTeamLogo: f.home.logo,
      awayTeamId: f.away.id,
      awayTeamName: f.away.name,
      awayTeamLogo: f.away.logo,
      isUserMatch: f.home.id === null || f.away.id === null,
      status: "scheduled" as const,
      events: [] as MatchEvent[],
    })),
  )
}

/** Kariyer ana ekranı için: kulüp bilgisi + sıradaki maç + sezon ilerlemesi. */
export async function getMyCareerHome(): Promise<CareerHomeData | null> {
  const userId = await getUserId()
  const careerRows = await db.select().from(managerCareer).where(eq(managerCareer.userId, userId)).limit(1)
  if (careerRows.length === 0) return null
  const career = careerRows[0]

  if (career.status === "active") {
    await generateSeasonFixtures(career.id)
  }

  const fixtures = await db.select().from(managerFixture).where(eq(managerFixture.careerId, career.id))
  const matchdays = new Set(fixtures.map((f) => f.matchday))
  const playedMatchdays = new Set(fixtures.filter((f) => f.status === "played").map((f) => f.matchday))
  const nextUserFixture = fixtures.filter((f) => f.isUserMatch && f.status === "scheduled").sort((a, b) => a.matchday - b.matchday)[0]

  return {
    clubName: career.clubName,
    logoFile: career.logoFile,
    formation: career.formation,
    leagueId: career.leagueId,
    status: career.status as "building" | "active",
    nextFixture: nextUserFixture ? toFixtureSummary(nextUserFixture) : null,
    totalMatchdays: matchdays.size,
    matchdaysPlayed: playedMatchdays.size,
  }
}

/** Kullanıcının kariyerindeki tüm sezon takvimi (fikstür listesi ekranı için). */
export async function getSeasonFixtures(): Promise<FixtureSummary[]> {
  const userId = await getUserId()
  const careerRows = await db.select({ id: managerCareer.id }).from(managerCareer).where(eq(managerCareer.userId, userId)).limit(1)
  if (careerRows.length === 0) return []
  const fixtures = await db
    .select()
    .from(managerFixture)
    .where(eq(managerFixture.careerId, careerRows[0].id))
    .orderBy(asc(managerFixture.matchday))
  return fixtures.map(toFixtureSummary)
}

function computeLeagueTableFromFixtures(fixtures: (typeof managerFixture.$inferSelect)[]): LeagueTableRow[] {
  const rows = new Map<string, LeagueTableRow>()

  function ensureRow(teamId: number | null, name: string, logo: string | null): LeagueTableRow {
    const key = teamId === null ? "user" : String(teamId)
    let row = rows.get(key)
    if (!row) {
      row = { teamId, teamName: name, teamLogo: logo, isUser: teamId === null, played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
      rows.set(key, row)
    }
    return row
  }

  for (const f of fixtures) {
    ensureRow(f.homeTeamId, f.homeTeamName, f.homeTeamLogo)
    ensureRow(f.awayTeamId, f.awayTeamName, f.awayTeamLogo)
    if (f.status !== "played" || f.homeGoals === null || f.awayGoals === null) continue

    const home = ensureRow(f.homeTeamId, f.homeTeamName, f.homeTeamLogo)
    const away = ensureRow(f.awayTeamId, f.awayTeamName, f.awayTeamLogo)
    home.played++
    away.played++
    home.goalsFor += f.homeGoals
    home.goalsAgainst += f.awayGoals
    away.goalsFor += f.awayGoals
    away.goalsAgainst += f.homeGoals

    if (f.homeGoals > f.awayGoals) {
      home.win++
      away.lose++
      home.points += 3
    } else if (f.homeGoals < f.awayGoals) {
      away.win++
      home.lose++
      away.points += 3
    } else {
      home.draw++
      away.draw++
      home.points += 1
      away.points += 1
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.teamName.localeCompare(b.teamName)
  })
}

async function computeLeagueTable(careerId: string): Promise<LeagueTableRow[]> {
  const fixtures = await db.select().from(managerFixture).where(eq(managerFixture.careerId, careerId))
  return computeLeagueTableFromFixtures(fixtures)
}

/** Kullanıcının kariyerindeki lig tablosu (gerçek takımlar + kullanıcı, tamamen kendi simülasyonumuzdan). */
export async function getLeagueTable(): Promise<LeagueTableRow[]> {
  const userId = await getUserId()
  const careerRows = await db.select({ id: managerCareer.id }).from(managerCareer).where(eq(managerCareer.userId, userId)).limit(1)
  if (careerRows.length === 0) return []
  return computeLeagueTable(careerRows[0].id)
}

async function resolveSide(
  teamId: number | null,
  careerId: string,
  formation: string,
): Promise<{ strength: TeamStrength; roster: RosterPlayer[] }> {
  if (teamId === null) {
    const roster = await getUserSquadRoster(careerId, formation)
    return { roster, strength: groupStrengthFromRoster(roster) }
  }
  const [roster, strength] = await Promise.all([getRealTeamRoster(teamId), getOrComputeTeamStrength(careerId, teamId)])
  return { roster, strength }
}

/**
 * Bir fikstürü simüle eder. Kullanıcının maçındaysa, zorluk çarpanı SADECE
 * rakip (gerçek takım) tarafına uygulanır — gerçek takımlar birbiriyle
 * oynarken motor her zaman nötr güç değerleriyle çalışır.
 */
async function simulateFixtureRow(
  fixture: typeof managerFixture.$inferSelect,
  career: typeof managerCareer.$inferSelect,
) {
  const home = await resolveSide(fixture.homeTeamId, career.id, career.formation)
  const away = await resolveSide(fixture.awayTeamId, career.id, career.formation)

  let homeStrength = home.strength
  let awayStrength = away.strength
  if (fixture.isUserMatch) {
    if (fixture.homeTeamId !== null) {
      homeStrength = applyDifficultyToStrength(homeStrength, career.opponentStrengthPercent)
    } else if (fixture.awayTeamId !== null) {
      awayStrength = applyDifficultyToStrength(awayStrength, career.opponentStrengthPercent)
    }
  }

  return simulateMatch(homeStrength, awayStrength, home.roster, away.roster)
}

/** Bir matchday'deki fikstürleri sınırlı eşzamanlılıkla simüle edip DB'ye yazar. */
async function simulateAndPersistFixtures(
  fixtures: (typeof managerFixture.$inferSelect)[],
  career: typeof managerCareer.$inferSelect,
): Promise<Map<string, { homeGoals: number; awayGoals: number; events: MatchEvent[] }>> {
  const results = new Map<string, { homeGoals: number; awayGoals: number; events: MatchEvent[] }>()
  const CONCURRENCY = 4
  let cursor = 0

  async function worker() {
    while (cursor < fixtures.length) {
      const index = cursor++
      const fixture = fixtures[index]
      const result = await simulateFixtureRow(fixture, career)
      results.set(fixture.id, result)
      await db
        .update(managerFixture)
        .set({
          status: "played",
          homeGoals: result.homeGoals,
          awayGoals: result.awayGoals,
          events: fixture.isUserMatch ? result.events : [],
          playedAt: new Date(),
        })
        .where(eq(managerFixture.id, fixture.id))
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fixtures.length) }, worker))
  return results
}

/**
 * Ana aksiyon: kullanıcının sıradaki maçını (ve o matchday'deki TÜM diğer
 * gerçek takım maçlarını) simüle eder. Kullanıcının maçı canlı oynatma için
 * `events` ile birlikte döner; diğer maçlar sessizce (sadece skor) yazılır.
 */
export async function playNextFixture(): Promise<PlayNextFixtureResult> {
  const userId = await getUserId()
  const careerRows = await db.select().from(managerCareer).where(eq(managerCareer.userId, userId)).limit(1)
  if (careerRows.length === 0) return { ok: false, error: "noCareer" }
  const career = careerRows[0]
  if (career.status !== "active") return { ok: false, error: "notActive" }

  await generateSeasonFixtures(career.id)

  const nextUserFixtureRows = await db
    .select()
    .from(managerFixture)
    .where(and(eq(managerFixture.careerId, career.id), eq(managerFixture.isUserMatch, true), eq(managerFixture.status, "scheduled")))
    .orderBy(asc(managerFixture.matchday))
    .limit(1)

  if (nextUserFixtureRows.length === 0) {
    // Kullanıcının oynayacağı maç yok — sezon kullanıcı için bitti. Geriye,
    // kullanıcının bay geçtiği bir haftaya denk gelen gerçek-gerçek maçlar
    // kalmış olabilir; tabloyu tam bırakmak için onları da sessizce bitir.
    const leftover = await db
      .select()
      .from(managerFixture)
      .where(and(eq(managerFixture.careerId, career.id), eq(managerFixture.status, "scheduled")))
    if (leftover.length > 0) {
      await simulateAndPersistFixtures(leftover, career)
    }
    const table = await computeLeagueTable(career.id)
    revalidatePath("/oyunlar/kulubunu-kur")
    return { ok: true, seasonComplete: true, table }
  }

  const userFixture = nextUserFixtureRows[0]
  const matchdayFixtures = await db
    .select()
    .from(managerFixture)
    .where(and(eq(managerFixture.careerId, career.id), eq(managerFixture.matchday, userFixture.matchday), eq(managerFixture.status, "scheduled")))

  const results = await simulateAndPersistFixtures(matchdayFixtures, career)
  const userResult = results.get(userFixture.id)
  if (!userResult) {
    return { ok: false, error: "simulationFailed" }
  }

  const table = await computeLeagueTable(career.id)
  const upcoming = await db
    .select()
    .from(managerFixture)
    .where(and(eq(managerFixture.careerId, career.id), eq(managerFixture.isUserMatch, true), eq(managerFixture.status, "scheduled")))
    .orderBy(asc(managerFixture.matchday))
    .limit(1)

  revalidatePath("/oyunlar/kulubunu-kur")

  return {
    ok: true,
    seasonComplete: false,
    userMatch: {
      fixtureId: userFixture.id,
      homeTeamName: userFixture.homeTeamName,
      homeTeamLogo: userFixture.homeTeamLogo,
      awayTeamName: userFixture.awayTeamName,
      awayTeamLogo: userFixture.awayTeamLogo,
      homeGoals: userResult.homeGoals,
      awayGoals: userResult.awayGoals,
      events: userResult.events,
    },
    table,
    nextFixture: upcoming.length > 0 ? toFixtureSummary(upcoming[0]) : null,
  }
}
