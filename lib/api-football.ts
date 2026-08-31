import type {
  Fixture,
  FixturePlayerStat,
  FormGame,
  HomeAwaySplit,
  InjuryItem,
  LeagueBasicInfo,
  LineupPlayer,
  LiveMatchData,
  MatchEvent,
  PlayerProfile,
  SquadPlayer,
  StandingRow,
  StatItem,
  TeamBasicInfo,
  TeamInfo,
  TeamLineup,
  TeamSeasonStats,
} from "./types"
import { toTurkishCountry } from "./tr-aliases"
import { apiFootballFetch, safeApiFootballFetch } from "./api-football-client"
import { FEATURED_LEAGUE_IDS } from "./leagues"
import { getPlayerMarketValue, getPlayerMarketValues, getTeamMarketValue } from "./transfermarkt-market-values"

type ApiData = ReturnType<JSON["parse"]>

// Sezon geçişi (Ağustos) TR takvimine göre kabul edilir — panel header
// endpoint'leri (/api/player, /api/team, /api/league) VE bunların dinamik
// route karşılıkları (/oyuncu, /takim, /lig — SEO/paylaşım için) aynı tanımı
// kullanır ki hangi sezonun "güncel" sayıldığı her yerde birebir tutarlı olsun.
export function currentSeason(): number {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

// ---------------------------------------------------------------------------
// Featured leagues — tek kaynak lib/leagues.ts'de tanımlı. Bu diziye buradan
// erişilir ki maç listesi sıralaması ve arama kutusu (TOP_LEAGUES)
// hep aynı listeden türesin.
// Yeni bir lig eklemek/çıkarmak için lib/leagues.ts'i güncelle.
// ---------------------------------------------------------------------------
export { FEATURED_LEAGUE_IDS }

/** Returns the priority rank for a league: 0 = highest (first in list), Infinity = not featured. */
function featuredRank(leagueId: number): number {
  const idx = FEATURED_LEAGUE_IDS.indexOf(leagueId)
  return idx === -1 ? Infinity : idx
}

// API-Football'ın döndürdüğü `age` alanı GÜNCEL DEĞİL — sezon başında bir kez
// hesaplanıp o sezon boyunca sabit kalıyor gibi görünüyor (canlı testte Messi,
// Ronaldo, Neymar dahil kontrol edilen tüm oyuncularda 1 yaş eksik geldi).
// Bunun yerine `birth.date` alanından BUGÜNE göre yaşı kendimiz hesaplıyoruz —
// bu her zaman doğru ve güncel sonucu verir. Doğum tarihi yoksa API'nin
// verdiği yaşa (varsa) geri düşülür, o da yoksa null döner.
export function calculateAge(birthDate: string | null | undefined, fallbackAge?: number | null): number | null {
  if (birthDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      const now = new Date()
      let age = now.getFullYear() - year
      const hasHadBirthdayThisYear = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
      if (!hasHadBirthdayThisYear) age--
      if (Number.isFinite(age) && age >= 0) return age
    }
  }
  return fallbackAge ?? null
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
  forceRefresh = false,
): Promise<T[]> {
  // forceRefresh: Next.js fetch cache'ini VE api-football-client'taki bellek
  // içi 90s cache'i atlayıp API-Football'dan her zaman taze veri çeker.
  // Kullanıcı "yenile" dediğinde gerçekten yeni veri gelmesini garantiler.
  return apiFootballFetch<T>(path, params, forceRefresh ? { cache: "no-store" } : { revalidate })
}

/**
 * ÖNEMLİ — isim yanıltıcıydı: bu fonksiyon önceden gerçekte apiFootballFetch'i
 * (hata fırlatan varyantı) çağırıyordu, yani "safe" değildi. Bu dosyadaki
 * fonksiyonların çoğu (getEvents, getStatistics, getLineups, getInjuries,
 * getStandings, getSquad, getHeadToHead, getTeamSeasonStats, ...) safeFetch
 * kullanıyor VE bunlardan bazıları (getTeamSeasonStats, getLiveMatchData)
 * kendi içinde Promise.all ile birden fazla uç noktayı paralel çekiyor.
 * Promise.all "hepsi ya da hiçbiri" çalıştığı için, aralarından SADECE BİRİ
 * geçici olarak başarısız olsa (örn. kısa süreli 429) TÜM grup (örn. ev
 * sahibi VE deplasman takımının sezon istatistikleri, ya da maç panelindeki
 * "teamStats" sekmesinin tamamı) sessizce kaybolup bir açılışta gözükürken
 * bir sonraki açılışta gözükmüyordu — panellerdeki tutarsız/eksik veri
 * şikayetinin köküydü. apiFootballFetch zaten 429/5xx için 5 kez üstel
 * geri çekilmeyle yeniden deniyor; bu noktaya kadar hâlâ başarısızsa
 * safeApiFootballFetch boş dizi döndürerek yalnızca o TEK uç noktayı
 * etkiler, aynı gruptaki diğer başarılı istekleri kaybettirmez.
 */
async function safeFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate = 60,
  forceRefresh = false,
): Promise<T[]> {
  // forceRefresh: apiFetch'teki gibi hem Next.js fetch cache'ini hem de
  // api-football-client'taki bellek içi cache'i atlar. Gol kutlama
  // animasyonu gibi "az önce oldu" anlarında 30s'lik events cache'i yanlış
  // (eski) golcüyü göstermeye sebep olabildiği için kullanılır.
  return safeApiFootballFetch<T>(path, params, forceRefresh ? { cache: "no-store" } : { revalidate })
}

// ---------------------------------------------------------------------------
// Raw types
// ---------------------------------------------------------------------------

interface RawFixture {
  fixture: {
    id: number
    date: string
    timestamp: number
    status: { long: string; short: string; elapsed: number | null; extra?: number | null }
    venue: { name: string | null }
    referee: string | null
  }
  league: { id: number; name: string; country: string; logo: string; season: number; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

/** API-Football hakemi "Ad Soyad (Ülke)" formatında döndürür. İkisini ayır. */
function parseReferee(raw: string | null): { name: string | null; country: string | null } {
  if (!raw) return { name: null, country: null }
  const match = raw.match(/^(.+?)\s*\((.+?)\)\s*$/)
  if (match) return { name: match[1].trim(), country: match[2].trim() }
  return { name: raw.trim(), country: null }
}

function mapFixture(r: RawFixture): Fixture {
  const { name: referee, country: refereeCountry } = parseReferee(r.fixture.referee ?? null)
  return {
    id: r.fixture.id,
    date: r.fixture.date,
    timestamp: r.fixture.timestamp,
    status: r.fixture.status.long,
    statusShort: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed ?? null,
    elapsedExtra: r.fixture.status.extra ?? null,
    venue: r.fixture.venue?.name ?? null,
    league: {
      id: r.league.id,
      name: r.league.name,
      country: toTurkishCountry(r.league.country),
      logo: r.league.logo,
      season: r.league.season,
      round: r.league.round,
    },
    home: { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
    away: { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
    goalsHome: r.goals.home,
    goalsAway: r.goals.away,
    referee,
    refereeCountry,
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function getFixturesByDate(date: string, forceRefresh = false): Promise<Fixture[]> {
  const raw = await apiFetch<RawFixture>("/fixtures", { date, timezone: "Europe/Istanbul" }, 120, forceRefresh)

  const fixtures = raw.map(mapFixture)

  // For non-featured leagues, compute each league's earliest kick-off time
  // so we can sort leagues as a whole block rather than interleaving matches.
  const leagueFirstKickoff = new Map<number, number>()
  for (const f of fixtures) {
    const rank = featuredRank(f.league.id)
    if (rank === Infinity) {
      const current = leagueFirstKickoff.get(f.league.id)
      if (current === undefined || f.timestamp < current) {
        leagueFirstKickoff.set(f.league.id, f.timestamp)
      }
    }
  }

  // Sort:
  //  1. Featured leagues first, in their defined list order.
  //  2. Non-featured leagues grouped together, ordered by the league's
  //     earliest kick-off time (earlier leagues come first).
  //  3. Within ApiData league, matches are ordered by kick-off time.
  fixtures.sort((a, b) => {
    const aRank = featuredRank(a.league.id)
    const bRank = featuredRank(b.league.id)

    // Both featured — keep list order, then kick-off within league
    if (aRank !== Infinity && bRank !== Infinity) {
      if (aRank !== bRank) return aRank - bRank
      return a.timestamp - b.timestamp
    }

    // One featured, one not — featured always wins
    if (aRank !== Infinity) return -1
    if (bRank !== Infinity) return 1

    // Both non-featured — sort by league's earliest kick-off, then individual time
    const aLeagueTime = leagueFirstKickoff.get(a.league.id) ?? a.timestamp
    const bLeagueTime = leagueFirstKickoff.get(b.league.id) ?? b.timestamp
    if (aLeagueTime !== bLeagueTime) return aLeagueTime - bLeagueTime
    if (a.league.id !== b.league.id) return a.league.id - b.league.id
    return a.timestamp - b.timestamp
  })

  return fixtures
}

export async function getFixtureById(id: number): Promise<Fixture | null> {
  const raw = await apiFetch<RawFixture>("/fixtures", { id }, 30)
  if (raw.length === 0) return null
  return mapFixture(raw[0])
}

// ---------------------------------------------------------------------------
// Panel header ("basic info") — /api/player, /api/team, /api/league hafif
// endpoint'leri VE bunların dinamik route karşılıkları (/oyuncu/[id],
// /takim/[id], /lig/[id]) aynı veriyi tek bir yerden okusun diye burada
// toplandı. Diğer tüm panel verisi (istatistik, kadro, transferler vb.)
// hâlâ ayrı /section endpoint'lerinden, sekmeye tıklanınca çekiliyor.
// ---------------------------------------------------------------------------

export async function getPlayerBasicProfile(playerId: number): Promise<PlayerProfile | null> {
  const season = currentSeason()
  let playerRaw = await apiFootballFetch<ApiData>("/players", { id: playerId, season }, { cache: "no-store" })
  // ÖNEMLİ — API-Football'ın "/players" uç noktası SEZONA BAĞLI: oyuncu o
  // sezonda hiç maça çıkmamışsa (yeni sezon henüz başladı, sakatlık, transfer
  // sonrası ilk maçını oynamadı vb.) boş dizi döner — oyuncu var olsa bile.
  // Bunu "oyuncu bulunamadı" (404) sanıp panelde "Veri alınamadı" hatası
  // göstermek yanlıştı; bir önceki sezona (gerekirse ondan öncesine) bakarak
  // en azından isim/foto/uyruk/boy/kilo gibi profil bilgilerini bulabiliriz.
  if (!playerRaw || playerRaw.length === 0) {
    playerRaw = await apiFootballFetch<ApiData>("/players", { id: playerId, season: season - 1 }, { cache: "no-store" })
  }
  if (!playerRaw || playerRaw.length === 0) {
    playerRaw = await apiFootballFetch<ApiData>("/players", { id: playerId, season: season - 2 }, { cache: "no-store" })
  }
  if (!playerRaw || playerRaw.length === 0) return null

  const entry = playerRaw[0]
  const p = entry.player ?? {}
  const currentStats = entry.statistics?.[0] ?? {}
  const marketValueEur = await getPlayerMarketValue(playerId)

  return {
    id: p.id ?? 0,
    name: p.name ?? "",
    firstname: p.firstname ?? "",
    lastname: p.lastname ?? "",
    age: calculateAge(p.birth?.date, p.age),
    birthDate: p.birth?.date ?? null,
    birthPlace: p.birth?.place ?? null,
    birthCountry: p.birth?.country ?? null,
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
          country: toTurkishCountry(currentStats.league.country),
          logo: currentStats.league.logo ?? "",
          season: currentStats.league.season,
        }
      : null,
    marketValueEur,
  }
}

// Takım paneli başlığında ülke bayrağı göstermek için: API-Football'un
// /teams yanıtı ülke adını verir ama bayrak URL'si vermez — /countries
// endpoint'i isme göre bayrak döndürüyor. Aynı ülke tekrar tekrar
// sorgulanmasın diye process içinde kalıcı bir bellek cache'i kullanıyoruz
// (ülke bayrakları pratikte hiç değişmez).
const countryFlagCache = new Map<string, string | null>()

async function getCountryFlagUrl(countryName: string | null): Promise<string | null> {
  if (!countryName) return null
  if (countryFlagCache.has(countryName)) return countryFlagCache.get(countryName) ?? null
  try {
    const raw = await apiFootballFetch<ApiData>("/countries", { name: countryName })
    const flag = raw?.[0]?.flag ?? null
    countryFlagCache.set(countryName, flag)
    return flag
  } catch {
    countryFlagCache.set(countryName, null)
    return null
  }
}

export async function getTeamBasicInfo(teamId: number): Promise<TeamBasicInfo | null> {
  const teamRaw = await apiFootballFetch<ApiData>("/teams", { id: teamId }, { cache: "no-store" })
  if (!teamRaw || teamRaw.length === 0) return null

  const rawTeam = teamRaw[0]
  const [flagUrl, marketValueEur] = await Promise.all([
    getCountryFlagUrl(rawTeam.team.country ?? null),
    getTeamMarketValue(teamId),
  ])
  const team: TeamInfo = {
    id: rawTeam.team.id,
    name: rawTeam.team.name,
    logo: rawTeam.team.logo,
    country: toTurkishCountry(rawTeam.team.country ?? ""),
    flagUrl,
  }

  return {
    team,
    venue: {
      name: rawTeam.venue?.name ?? null,
      city: rawTeam.venue?.city ?? null,
      capacity: rawTeam.venue?.capacity ?? null,
      image: rawTeam.venue?.image ?? null,
    },
    currentSeason: currentSeason(),
    marketValueEur,
  }
}

export async function getLeagueBasicInfo(leagueId: number): Promise<LeagueBasicInfo | null> {
  const season = currentSeason()
  let leagueRaw = await apiFootballFetch<ApiData>("/leagues", { id: leagueId, season }, { cache: "no-store" })
  // Bkz. getPlayerBasicProfile — "/leagues?season=" da sezona bağlı: yeni
  // sezon henüz API-Football tarafında oluşturulmamışsa (özellikle küçük
  // liglerde gecikebiliyor) boş dizi döner, lig var olsa bile. Önceki sezona
  // düşerek en azından isim/logo/bayrak bilgisini bulabiliriz.
  if (!leagueRaw || leagueRaw.length === 0) {
    leagueRaw = await apiFootballFetch<ApiData>("/leagues", { id: leagueId, season: season - 1 }, { cache: "no-store" })
  }
  if (!leagueRaw || leagueRaw.length === 0) return null

  const rawLeague = leagueRaw[0]
  return {
    league: {
      id: rawLeague.league?.id ?? leagueId,
      name: rawLeague.league?.name ?? "",
      country: toTurkishCountry(rawLeague.country?.name ?? ""),
      logo: rawLeague.league?.logo ?? "",
      flagUrl: rawLeague.country?.flag ?? null,
    },
    season,
  }
}

// ---------------------------------------------------------------------------
// Match detail helpers
// ---------------------------------------------------------------------------

function buildRecentForm(team: TeamInfo, raw: RawFixture[]): FormGame[] {
  const games: FormGame[] = []
  for (const r of raw) {
    if (!/FT|AET|PEN/.test(r.fixture.status.short)) continue
    const isHome = r.teams.home.id === team.id
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({ opponent, scored, conceded, result, home: isHome, date: r.fixture.date })
  }
  return games
}

export async function getTeamSeasonStats(
  team: TeamInfo,
  leagueId: number,
  season: number,
): Promise<TeamSeasonStats | null> {
  const [statsArr, recentRaw] = await Promise.all([
    safeFetch<ApiData>("/teams/statistics", { team: team.id, league: leagueId, season }, 3600),
    safeFetch<RawFixture>("/fixtures", { team: team.id, last: 6 }, 600),
  ])

  const recent = buildRecentForm(team, recentRaw).slice(0, 6)
  const s = Array.isArray(statsArr) ? (statsArr as ApiData) : statsArr
  const stat = (s && (s.fixtures ? s : s[0])) as ApiData

  if (!stat || !stat.fixtures) {
    // No season stats (e.g. cup game). Derive a minimal record from recent form,
    // split by home/away using the "home" flag already present on each game.
    if (recent.length === 0) return null
    const wins = recent.filter((g) => g.result === "W").length
    const draws = recent.filter((g) => g.result === "D").length
    const losses = recent.filter((g) => g.result === "L").length
    const gf = recent.reduce((a, g) => a + g.scored, 0)
    const ga = recent.reduce((a, g) => a + g.conceded, 0)
    return {
      team,
      formString: recent.map((g) => g.result).reverse().join(""),
      played: recent.length,
      wins,
      draws,
      losses,
      goalsForAvg: gf / recent.length,
      goalsAgainstAvg: ga / recent.length,
      cleanSheets: recent.filter((g) => g.conceded === 0).length,
      failedToScore: recent.filter((g) => g.scored === 0).length,
      recent,
      home: splitFromRecent(recent, true),
      away: splitFromRecent(recent, false),
    }
  }

  const num = (v: unknown): number => {
    const n = typeof v === "string" ? Number.parseFloat(v) : Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // API-Football /teams/statistics ayrıca fixtures.*.home / fixtures.*.away ve
  // goals.*.average.home / .away alanlarını döndürür — ev sahibi avantajını
  // izole etmek için bunları kullanıyoruz. Hiç maç oynanmamışsa (played=0)
  // null döndürüyoruz ki prompt'ta yanıltıcı "0.0 gol" göstermeyelim.
  const buildSplit = (side: "home" | "away"): HomeAwaySplit | null => {
    const played = num(stat.fixtures?.played?.[side])
    if (played === 0) return null
    return {
      played,
      wins: num(stat.fixtures?.wins?.[side]),
      draws: num(stat.fixtures?.draws?.[side]),
      losses: num(stat.fixtures?.loses?.[side]),
      goalsForAvg: num(stat.goals?.for?.average?.[side]),
      goalsAgainstAvg: num(stat.goals?.against?.average?.[side]),
    }
  }

  return {
    team,
    formString: (stat.form ?? "").slice(-6),
    played: num(stat.fixtures?.played?.total),
    wins: num(stat.fixtures?.wins?.total),
    draws: num(stat.fixtures?.draws?.total),
    losses: num(stat.fixtures?.loses?.total),
    goalsForAvg: num(stat.goals?.for?.average?.total),
    goalsAgainstAvg: num(stat.goals?.against?.average?.total),
    cleanSheets: num(stat.clean_sheet?.total),
    failedToScore: num(stat.failed_to_score?.total),
    recent,
    home: buildSplit("home"),
    away: buildSplit("away"),
  }
}

/** /teams/statistics response'u yoksa (kupa maçı vb.) son 6 maçtan ev/deplasman ayrımı çıkar. */
function splitFromRecent(recent: FormGame[], home: boolean): HomeAwaySplit | null {
  const games = recent.filter((g) => g.home === home)
  if (games.length === 0) return null
  const wins = games.filter((g) => g.result === "W").length
  const draws = games.filter((g) => g.result === "D").length
  const losses = games.filter((g) => g.result === "L").length
  const gf = games.reduce((a, g) => a + g.scored, 0)
  const ga = games.reduce((a, g) => a + g.conceded, 0)
  return {
    played: games.length,
    wins,
    draws,
    losses,
    goalsForAvg: gf / games.length,
    goalsAgainstAvg: ga / games.length,
  }
}

export async function getHeadToHead(homeId: number, awayId: number): Promise<FormGame[]> {
  const raw = await safeFetch<RawFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 8 }, 3600)
  raw.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
  const games: FormGame[] = []
  for (const r of raw) {
    if (!/FT|AET|PEN/.test(r.fixture.status.short)) continue
    const isHome = r.teams.home.id === homeId
    const scored = (isHome ? r.goals.home : r.goals.away) ?? 0
    const conceded = (isHome ? r.goals.away : r.goals.home) ?? 0
    const opponent = isHome ? r.teams.away.name : r.teams.home.name
    const result: "W" | "D" | "L" = scored > conceded ? "W" : scored === conceded ? "D" : "L"
    games.push({
      opponent, scored, conceded, result, home: isHome, date: r.fixture.date,
      homeTeam: r.teams.home.name,
      awayTeam: r.teams.away.name,
      fixtureId: r.fixture.id,
      leagueId: r.league.id,
    })
  }
  return games
}

/**
 * Bir ligin BÜTÜN katılımcı takım listesini döndürür (/teams uç noktası).
 *
 * ÖNEMLİ — bilerek /standings DEĞİL /teams kullanılıyor: /standings, bir
 * takımın o sezon henüz resmi lig maçı oynanmamış/kayda geçmemiş olması
 * durumunda o takımı listeden tamamen ATLAR (örn. sezon başında fikstürü
 * ertelenen veya yeni terfi eden bir takım). /teams ise sezona katılan TÜM
 * takımları, hiç maç oynanmamış olsa bile eksiksiz döndürür. Piyasa değeri
 * eşleştirme zinciri takım listesini buradan almalı; aksi halde standings'te
 * henüz görünmeyen bir takım (ve onun tüm kadrosu) hiç taranmaz.
 */
export async function getLeagueTeams(leagueId: number, season: number): Promise<{ id: number; name: string }[]> {
  const raw = await safeFetch<ApiData>("/teams", { league: leagueId, season }, 3600)
  return raw
    .map((r) => ({ id: r.team?.id ?? 0, name: r.team?.name ?? "" }))
    .filter((t) => t.id !== 0)
}

export async function getStandings(leagueId: number, season: number, teamIds: number[]): Promise<StandingRow[]> {
  const raw = await safeFetch<ApiData>("/standings", { league: leagueId, season }, 3600)
  if (raw.length === 0) return []
  const league = raw[0]?.league
  const groups: ApiData[][] = league?.standings ?? []
  const rows: StandingRow[] = []
  for (const group of groups) {
    for (const row of group) {
      rows.push({
        rank: row.rank,
        team: row.team?.name ?? "",
        teamId: row.team?.id ?? 0,
        teamLogo: row.team?.logo ?? "",
        points: row.points ?? 0,
        played: row.all?.played ?? 0,
        win: row.all?.win ?? 0,
        draw: row.all?.draw ?? 0,
        lose: row.all?.lose ?? 0,
        goalsFor: row.all?.goals?.for ?? 0,
        goalsAgainst: row.all?.goals?.against ?? 0,
        form: row.form ?? null,
        group: row.group ?? league?.name ?? "",
      })
    }
  }
  // Keep only the group(s) that contain our two teams to reduce payload.
  const relevantGroups = new Set(rows.filter((r) => teamIds.includes(r.teamId)).map((r) => r.group))
  if (relevantGroups.size > 0) return rows.filter((r) => relevantGroups.has(r.group))
  return rows
}

export async function getOdds(
  fixtureId: number,
): Promise<{ home: number | null; draw: number | null; away: number | null; source: string | null }> {
  const raw = await safeFetch<ApiData>("/odds", { fixture: fixtureId }, 3600)
  if (!raw.length) return { home: null, draw: null, away: null, source: null }

  // İlk bookmaker'ın "Match Winner" (veya "1X2") bahsini bul; oranların
  // hangi bahis şirketinden geldiğini de (bookmaker.name) birlikte döndür.
  for (const entry of raw) {
    for (const bookmaker of entry.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) {
        const name: string = (bet.name ?? "").toLowerCase()
        if (name.includes("match winner") || name === "1x2") {
          const values: Array<{ value: string; odd: string }> = bet.values ?? []
          const parse = (label: string) => {
            const found = values.find((v) => v.value.toLowerCase() === label)
            return found ? parseFloat(found.odd) : null
          }
          return {
            home: parse("home"),
            draw: parse("draw"),
            away: parse("away"),
            source: bookmaker.name ?? null,
          }
        }
      }
    }
  }
  return { home: null, draw: null, away: null, source: null }
}

export async function getSquad(teamId: number): Promise<SquadPlayer[]> {
  const raw = await safeFetch<ApiData>("/players/squads", { team: teamId }, 3600)
  if (!raw.length) return []
  const players: ApiData[] = raw[0]?.players ?? []
  const marketValues = await getPlayerMarketValues(players.map((player) => player.id ?? 0))
  return players.map((p) => ({
    id: p.id ?? 0,
    name: p.name ?? "",
    age: p.age ?? null,
    number: p.number ?? null,
    pos: p.position ?? null,
    photo: p.photo ?? null,
    marketValueEur: marketValues.get(p.id ?? 0) ?? null,
  }))
}

/**
 * Bir oyuncunun mevkisini/fotoğrafını/yaşını, TAKIMIN kadro listesinden
 * (`/players/squads`) DEĞİL, doğrudan oyuncunun kendi profilinden
 * (`/players?id=...`) okur. Menajer kariyeri oyuncu aramasında, DB'deki
 * piyasa değeri satırının `teamId`'si API-Football'ın güncel kadro
 * listesiyle örtüşmediğinde (transfer, kiralık, listeye eklenmemiş vb.)
 * `getSquad` o oyuncuyu hiç döndürmeyebilir — bu durumda arama sonucu
 * tamamen düşer. Bu fonksiyon o oyuncular için tek-tek fallback sorgusu
 * yapıp aramada kaybolmalarını önler.
 */
export async function getPlayerRoleAndPhoto(
  playerId: number,
): Promise<{ role: string | null; photo: string | null; age: number | null } | null> {
  const season = currentSeason()
  let raw = await apiFootballFetch<ApiData>("/players", { id: playerId, season }, { cache: "no-store" })
  // Bkz. getPlayerBasicProfile — sezona bağlı olduğu için önceki sezona
  // düşmeden dönmek, aktif oynamayan oyuncuları haksız yere kaybettirir.
  if (!raw || raw.length === 0) {
    raw = await apiFootballFetch<ApiData>("/players", { id: playerId, season: season - 1 }, { cache: "no-store" })
  }
  if (!raw || raw.length === 0) return null
  const entry = raw[0]
  const p = entry.player ?? {}
  const currentStats = entry.statistics?.[0] ?? {}
  return {
    role: currentStats.games?.position ?? null,
    photo: p.photo ?? null,
    age: calculateAge(p.birth?.date, p.age),
  }
}

/**
 * Bir takımın API-Football'daki menşei ülkesini döndürür. SADECE piyasa
 * değeri takım adı karşılaştırması gereken yerlerde kullanılır.
 */
export async function getTeamCountry(teamId: number): Promise<string | null> {
  const raw = await safeFetch<ApiData>("/teams", { id: teamId }, 3600)
  const country = raw[0]?.team?.country ?? null
  return country ? toTurkishCountry(country) : null
}

/**
 * Bir oyuncunun API-Football'daki uyruğunu döndürür. SADECE piyasa değeri
 * manuel gözden geçirme kuyruğu için kullanılır (bkz. getTeamCountry).
 */
export async function getPlayerNationality(playerId: number, season: number): Promise<string | null> {
  const raw = await safeFetch<ApiData>("/players", { id: playerId, season }, 3600)
  const nationality = raw[0]?.player?.nationality ?? null
  return nationality ? toTurkishCountry(nationality) : null
}

export async function getInjuries(fixtureId: number): Promise<InjuryItem[]> {
  const raw = await safeFetch<ApiData>("/injuries", { fixture: fixtureId }, 1800)
  // ÖNEMLİ — API-Football'ın "/injuries" endpoint'i aynı oyuncu için aynı
  // takım/tip/gerekçe kombinasyonunu bazen birden fazla kez döndürüyor, bu da
  // maç analiz panelinde "K. Merah - Ankle Injury" gibi satırların iki kez
  // görünmesine yol açıyordu. Takım+oyuncu+tip+gerekçeye göre dedup yapılıyor.
  const seenInjuryKeys = new Set<string>()
  const items: InjuryItem[] = []
  for (const r of raw) {
  const item: InjuryItem = {
  team: r.team?.name ?? "",
  player: r.player?.name ?? "",
  playerId: r.player?.id ?? null,
  reason: r.player?.reason ?? "",
  type: r.player?.type ?? "",
  }
  const key = `${item.team}-${item.playerId ?? item.player}-${item.type}-${item.reason}`
  if (seenInjuryKeys.has(key)) continue
  seenInjuryKeys.add(key)
  items.push(item)
  }
  return items
  }

export async function getEvents(fixtureId: number, forceRefresh = false): Promise<MatchEvent[]> {
  const raw = await safeFetch<ApiData>("/fixtures/events", { fixture: fixtureId }, 30, forceRefresh)
  return raw.map((r) => ({
    minute: r.time?.elapsed ?? 0,
    extra: r.time?.extra ?? null,
    team: r.team?.name ?? "",
    player: r.player?.name ?? null,
    playerId: r.player?.id ?? null,
    assist: r.assist?.name ?? null,
    assistId: r.assist?.id ?? null,
    type: r.type ?? "",
    detail: r.detail ?? "",
  }))
}

export async function getStatistics(fixtureId: number): Promise<StatItem[]> {
  const raw = await safeFetch<ApiData>("/fixtures/statistics", { fixture: fixtureId }, 30)
  if (raw.length < 2) return []
  const home = raw[0]?.statistics ?? []
  const away = raw[1]?.statistics ?? []
  const items: StatItem[] = []
  for (let i = 0; i < home.length; i++) {
    items.push({
      type: home[i]?.type ?? "",
      home: home[i]?.value ?? null,
      away: away[i]?.value ?? null,
    })
  }
  return items
}

export async function getLineups(fixtureId: number): Promise<TeamLineup[]> {
  const raw = await safeFetch<ApiData>("/fixtures/lineups", { fixture: fixtureId }, 300)
  const mapPlayers = (arr: ApiData[]): LineupPlayer[] =>
    (arr ?? []).map((p) => ({
      id: p.player?.id ?? null,
      number: p.player?.number ?? null,
      name: p.player?.name ?? "",
      pos: p.player?.pos ?? null,
      grid: p.player?.grid ?? null,
    }))
  return raw.map((r) => ({
    team: r.team?.name ?? "",
    formation: r.formation ?? null,
    coach: r.coach?.name ?? null,
    startXI: mapPlayers(r.startXI),
    substitutes: mapPlayers(r.substitutes),
  }))
}

// ---------------------------------------------------------------------------
// Fixture player stats (per-player match performance)
// ---------------------------------------------------------------------------

export async function getFixturePlayerStats(fixtureId: number): Promise<FixturePlayerStat[]> {
  // TTL'yi 60s'den 30s'ye düşürdük: canlı maç minute'unu (getFixtureById,
  // TTL=30) ve maç olayları/istatistiklerini (getEvents/getStatistics,
  // TTL=30) besleyen bizim kendi response cache katmanımızla aynı ritimde
  // olsun — panelin üst kısmındaki dakika her 30s'de tazelenirken oyuncu
  // performansları sekmesi kendi 60s cache'i yüzünden bir tur daha geriden
  // gelebiliyordu. Bu, sadece BİZİM eklediğimiz gecikmeyi azaltır; API-
  // Football'ın kendi canlı oyuncu puanı/istatistik beslemesi de sağlayıcı
  // tarafında periyodik olarak güncellendiğinden (gerçek zamanlı değil),
  // dakika ile içerik arasında birkaç dakikalık fark tamamen kapanmayabilir.
  const raw = await safeFetch<ApiData>("/fixtures/players", { fixture: fixtureId }, 30)
  const result: FixturePlayerStat[] = []
  for (const teamBlock of raw) {
    const teamName: string = teamBlock?.team?.name ?? ""
    const teamId: number = teamBlock?.team?.id ?? 0
    for (const entry of teamBlock?.players ?? []) {
      const p = entry.player
      const s = entry.statistics?.[0]
      result.push({
        team: teamName,
        teamId,
        player: {
          id: p?.id ?? 0,
          name: p?.name ?? "",
          photo: p?.photo ?? null,
          number: s?.games?.number ?? null,
          pos: s?.games?.position ?? null,
        },
        rating: s?.games?.rating ?? null,
        minutes: s?.games?.minutes ?? null,
        goals: s?.goals?.total ?? null,
        assists: s?.goals?.assists ?? null,
        yellowCard: !!s?.cards?.yellow,
        redCard: !!s?.cards?.red,
        shots: s?.shots?.total ?? null,
        shotsOn: s?.shots?.on ?? null,
        passes: s?.passes?.total ?? null,
        passesAccuracy: s?.passes?.accuracy ?? null,
        tackles: s?.tackles?.total ?? null,
        dribbles: s?.dribbles?.attempts ?? null,
        captain: !!s?.games?.captain,
        substitute: !!s?.games?.substitute,
        saves: s?.goals?.saves ?? null,
        goalsConceded: s?.goals?.conceded ?? null,
        keyPasses: s?.passes?.key ?? null,
        interceptions: s?.tackles?.interceptions ?? null,
        blocks: s?.tackles?.blocks ?? null,
        duelsTotal: s?.duels?.total ?? null,
        duelsWon: s?.duels?.won ?? null,
        dribblesSuccess: s?.dribbles?.success ?? null,
      })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Aggregators
// ---------------------------------------------------------------------------

/** Gathers the full live/contextual dataset for the detail panel. */
export async function getLiveMatchData(fixture: Fixture): Promise<LiveMatchData> {
  const { id, home, away, league } = fixture
  const [events, statistics, lineups, standings, injuries, h2h, homeStats, awayStats, odds, homeSquad, awaySquad] =
    await Promise.all([
      getEvents(id),
      getStatistics(id),
      getLineups(id),
      getStandings(league.id, league.season, [home.id, away.id]),
      getInjuries(id),
      getHeadToHead(home.id, away.id),
      getTeamSeasonStats(home, league.id, league.season),
      getTeamSeasonStats(away, league.id, league.season),
      getOdds(id),
      getSquad(home.id),
      getSquad(away.id),
    ])

  return {
    fixture,
    events,
    statistics,
    lineups,
    standings,
    injuries,
    h2h,
    homeStats,
    awayStats,
    odds,
    homeSquad,
    awaySquad,
  }
}


