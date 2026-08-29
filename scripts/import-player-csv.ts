import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool, type PoolClient } from "pg"
import { FEATURED_LEAGUES } from "../lib/leagues"
import { matchPlayer, parsePlayerCsv, type ApiPlayerCandidate } from "../lib/player-import"
import { normalizePosition } from "../lib/player-positions"

const API_URL = "https://v3.football.api-sports.io"
const CSV_PATH = resolve(process.cwd(), "data/players.csv")
const season = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1
const sleep = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))

type RawPlayer = {
  player: {
    id: number
    name: string
    firstname: string | null
    lastname: string | null
    birth: { date: string | null; country: string | null }
    nationality: string | null
  }
  statistics: Array<{ team: { id: number; name: string }; league: { id: number; name: string; country: string } }>
}

async function apiPage(leagueId: number, page: number): Promise<{ rows: RawPlayer[]; pages: number }> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error("API_FOOTBALL_KEY tanımlı değil.")
  const url = new URL("/players", API_URL)
  url.searchParams.set("league", String(leagueId))
  url.searchParams.set("season", String(season))
  url.searchParams.set("page", String(page))

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { headers: { "x-apisports-key": key }, cache: "no-store" })
    if (response.ok) {
      const body = await response.json()
      if (body.errors && Object.keys(body.errors).length) throw new Error(`API-Football: ${JSON.stringify(body.errors)}`)
      return { rows: body.response ?? [], pages: body.paging?.total ?? 1 }
    }
    if (attempt === 5 || (response.status < 429 && response.status < 500)) {
      throw new Error(`API-Football ${response.status}: lig=${leagueId}, sayfa=${page}`)
    }
    await sleep(1000 * 2 ** attempt)
  }
  throw new Error("API-Football isteği tamamlanamadı.")
}

async function fetchCandidates(): Promise<ApiPlayerCandidate[]> {
  const candidates = new Map<number, ApiPlayerCandidate>()
  for (const league of FEATURED_LEAGUES) {
    let page = 1
    let pages = 1
    do {
      const result = await apiPage(league.id, page)
      pages = result.pages
      for (const row of result.rows) {
        const stat = row.statistics.find((item) => item.league.id === league.id) ?? row.statistics[0]
        if (!stat || !row.player.birth.date) continue
        const existing = candidates.get(row.player.id)
        const candidate: ApiPlayerCandidate = {
          playerId: row.player.id,
          name: row.player.name,
          firstName: row.player.firstname,
          lastName: row.player.lastname,
          dateOfBirth: row.player.birth.date,
          nationality: row.player.nationality ?? row.player.birth.country,
          teamId: stat.team.id,
          teamName: stat.team.name,
          teamCountry: league.country,
          leagueId: league.id,
          leagueName: league.name,
          leagueCountry: league.country,
        }
        // Ulusal lig bilgisi kupa bilgisinden daha güvenilir güncel takım kaynağıdır.
        if (!existing || existing.leagueCountry === "Avrupa") candidates.set(row.player.id, candidate)
      }
      page += 1
      if (page <= pages) await sleep(250)
    } while (page <= pages)
    console.log(`[v0] Kadro alındı: ${league.name}`)
  }
  if (!candidates.size) throw new Error("API-Football hiçbir oyuncu döndürmedi; mevcut veriler korunuyor.")
  return [...candidates.values()]
}

async function insertBatches(client: PoolClient, query: string, rows: unknown[][], columns: number) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500)
    const values = batch.flat()
    const placeholders = batch.map((_, row) => `(${Array.from({ length: columns }, (__, col) => `$${row * columns + col + 1}`).join(",")})`).join(",")
    await client.query(`${query} ${placeholders}`, values)
  }
}

async function main() {
  const csv = parsePlayerCsv(await readFile(CSV_PATH, "utf8"))
  const candidates = await fetchCandidates()
  const results = csv.map((player) => matchPlayer(player, candidates))
  const matched = results.filter((result) => result.status === "matched")
  const unmatched = results.filter((result) => result.status === "unmatched")
  const ambiguous = results.filter((result) => result.status === "ambiguous")
  const valueless = matched.filter((result) => result.status === "matched" && result.csv.marketValueEur === null)
  const writable = matched.filter((result) => result.status === "matched" && result.csv.marketValueEur !== null)
  const positioned = matched.filter((result) => result.status === "matched" && normalizePosition(result.csv.subPosition))

  const minimumSafeMatches = Math.min(100, Math.ceil(candidates.length * 0.25))
  if (matched.length < minimumSafeMatches) {
    throw new Error(`Kritik eşleştirme hatası: ${matched.length} eşleşme, en az ${minimumSafeMatches} bekleniyordu; mevcut veriler korunuyor.`)
  }

  const teamTotals = new Map<number, { candidate: ApiPlayerCandidate; total: number }>()
  for (const result of writable) {
    if (result.status !== "matched" || result.csv.marketValueEur === null) continue
    const current = teamTotals.get(result.candidate.teamId)
    teamTotals.set(result.candidate.teamId, { candidate: result.candidate, total: (current?.total ?? 0) + result.csv.marketValueEur })
  }
  const leagueTotals = new Map<number, number>()
  for (const { candidate, total } of teamTotals.values()) leagueTotals.set(candidate.leagueId, (leagueTotals.get(candidate.leagueId) ?? 0) + total)

  console.log("[v0] Import doğrulama raporu", {
    csv: csv.length,
    apiCandidates: candidates.length,
    matched: matched.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    valueless: valueless.length,
    positioned: positioned.length,
    teams: teamTotals.size,
    leagues: leagueTotals.size,
  })
  console.log("[v0] Bilinen kayıtlar", matched.filter((result) => result.status === "matched" && /Rafael Leão|Romelu Lukaku/i.test(result.csv.name)).map((result) => result.status === "matched" ? ({ name: result.csv.name, value: result.csv.marketValueEur, position: result.csv.subPosition, currentTeam: result.candidate.teamName }) : null))
  if (unmatched.length) console.log("[v0] Eşleşmeyen örnekler", unmatched.slice(0, 20).map((result) => result.csv.name))
  if (ambiguous.length) console.log("[v0] Belirsiz örnekler", ambiguous.slice(0, 20).map((result) => result.csv.name))

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM player_position")
    await client.query("DELETE FROM player_market_value")
    await client.query("DELETE FROM team_market_value")
    await client.query("DELETE FROM league_market_value")
    await client.query("DELETE FROM player_power")

    await insertBatches(client, 'INSERT INTO player_market_value (id, "playerId", "teamId", "playerName", "fullName", "playerCountry", "valueEur", "createdAt", "updatedAt") VALUES', writable.map((result) => result.status === "matched" ? [randomUUID(), result.candidate.playerId, result.candidate.teamId, result.candidate.name, result.csv.name, result.candidate.nationality, result.csv.marketValueEur, new Date(), new Date()] : []), 9)
    await insertBatches(client, 'INSERT INTO player_position (id, "playerId", "mainPosition", "createdAt", "updatedAt") VALUES', positioned.map((result) => result.status === "matched" ? [randomUUID(), result.candidate.playerId, normalizePosition(result.csv.subPosition), new Date(), new Date()] : []), 5)
    await insertBatches(client, 'INSERT INTO team_market_value (id, "teamId", "leagueId", "teamName", "teamCountry", "totalValueEur", "createdAt", "updatedAt") VALUES', [...teamTotals.values()].map(({ candidate, total }) => [randomUUID(), candidate.teamId, candidate.leagueId, candidate.teamName, candidate.teamCountry, total, new Date(), new Date()]), 8)
    await insertBatches(client, 'INSERT INTO league_market_value (id, "leagueId", "leagueName", "leagueCountry", "totalValueEur", "createdAt", "updatedAt") VALUES', FEATURED_LEAGUES.filter((league) => leagueTotals.has(league.id)).map((league) => [randomUUID(), league.id, league.name, league.country, leagueTotals.get(league.id), new Date(), new Date()]), 7)
    await client.query("COMMIT")
    console.log("[v0] Import başarıyla tamamlandı.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[v0] Import başarısız:", error)
  process.exitCode = 1
})
