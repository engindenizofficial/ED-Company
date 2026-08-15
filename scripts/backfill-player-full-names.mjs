// Tek seferlik veri doldurma scripti — mevcut (eşleşmiş) "player_market_value"
// satırlarına Transfermarkt kaynaklı TAM ad ("fullName") bilgisini doldurur.
//
// NEDEN: playerName API-Football'ın kısaltılmış formatını tutuyor (örn.
// "O. Dembélé"), bu da kadro arama ekranında kullanıcı "Ousmane" yazınca
// eşleşme bulunamamasına sebep oluyordu. Tam ad API-Football'dan SADECE
// oyuncu başına 1 istekle alınabiliyor (günlük 7500 istek kotasını anında
// tüketir) — bunun yerine zaten haftalık cron'un kullandığı Transfermarkt
// kadro sayfası (scrapeTeamSquad) tekrar taranır; bu, API-Football kotasını
// HİÇ kullanmaz, sadece Transfermarkt'a takım başına 1 istek atar.
//
// Çalıştırma: node --env-file-if-exists=/vercel/share/.env.project scripts/backfill-player-full-names.mjs
import { Pool } from "pg"
import * as cheerio from "cheerio"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const BASE_URL = "https://www.transfermarkt.com"
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
        redirect: "follow",
      })
      if (!res.ok) {
        if (res.status === 404) return null
        if ((res.status >= 500 || res.status === 429 || res.status === 403) && attempt < retries) {
          await sleep([3000, 8000, 20000][attempt] ?? 20000)
          continue
        }
        console.error(`[v0] HTTP ${res.status} for ${url}`)
        return null
      }
      return await res.text()
    } catch (err) {
      if (attempt < retries) {
        await sleep([3000, 8000, 20000][attempt] ?? 20000)
        continue
      }
      console.error(`[v0] fetch failed for ${url}:`, err.message)
      return null
    }
  }
  return null
}

function extractIdFromHref(href, kind) {
  if (!href) return null
  const match = href.match(new RegExp(`/${kind}/(\\d+)`))
  return match ? match[1] : null
}

// lib/transfermarkt-scraper.ts -> scrapeTeamSquad ile AYNI seçici — sadece
// tam ad bilgisi eksik olduğu için burada ayrıca tutuluyor.
function extractSquadPlayers(html) {
  const $ = cheerio.load(html)
  const players = []
  $("table.items").first().find("> tbody > tr").each((_, el) => {
    const row = $(el)
    const nameLink = row.find("td.posrela table.inline-table a").first()
    const name = nameLink.text().trim()
    const transfermarktId = extractIdFromHref(nameLink.attr("href"), "spieler")
    if (!name || !transfermarktId) return
    players.push({ transfermarktId, name })
  })
  return players
}

async function scrapeTeamSquadNames(transfermarktTeamId) {
  const url = `${BASE_URL}/x/kader/verein/${transfermarktTeamId}/plus/1`
  const html = await fetchHtml(url)
  if (!html) return []
  return extractSquadPlayers(html)
}

async function main() {
  const client = await pool.connect()
  try {
    const teamsRes = await client.query(
      `SELECT DISTINCT "teamId", "transfermarktTeamId" FROM team_market_value WHERE "matchStatus" = 'matched' AND "transfermarktTeamId" IS NOT NULL`,
    )
    const teams = teamsRes.rows
    console.log(`[v0] ${teams.length} takım taranacak.`)

    let updatedTotal = 0
    let teamIndex = 0

    for (const team of teams) {
      teamIndex++
      const scraped = await scrapeTeamSquadNames(team.transfermarktTeamId)
      if (scraped.length === 0) {
        console.log(`[v0] (${teamIndex}/${teams.length}) team ${team.teamId}: kadro boş/başarısız, atlanıyor.`)
        await sleep(800)
        continue
      }

      const playersRes = await client.query(
        `SELECT "playerId", "transfermarktPlayerId" FROM player_market_value WHERE "teamId" = $1 AND "matchStatus" = 'matched' AND "transfermarktPlayerId" IS NOT NULL`,
        [team.teamId],
      )

      let updatedForTeam = 0
      for (const row of playersRes.rows) {
        const scrapedMatch = scraped.find((sp) => sp.transfermarktId === row.transfermarktPlayerId)
        if (!scrapedMatch) continue
        await client.query(`UPDATE player_market_value SET "fullName" = $1 WHERE "playerId" = $2`, [
          scrapedMatch.name,
          row.playerId,
        ])
        updatedForTeam++
      }
      updatedTotal += updatedForTeam
      console.log(`[v0] (${teamIndex}/${teams.length}) team ${team.teamId}: ${updatedForTeam}/${playersRes.rows.length} oyuncu güncellendi.`)

      await sleep(800)
    }

    console.log(`[v0] Tamamlandı. Toplam güncellenen oyuncu: ${updatedTotal}`)
  } finally {
    await client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Backfill failed:", err)
  process.exit(1)
})
