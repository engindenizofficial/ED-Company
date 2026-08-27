import { getLeagueTeams, getSquad, getPlayerNationality } from "./api-football"
import { toTurkishCountry } from "./tr-aliases"
import type { ScrapedTeam, ScrapedPlayer } from "./transfermarkt-scraper"

// ---------------------------------------------------------------------------
// İsim + ülke eşleştirme (fuzzy matching) katmanı.
//
// API-Football ve Transfermarkt birbirinden bağımsız veritabanları; ortak
// bir ID yok. Elimizde isim VE (varsa) ülke bilgisi var. Bu modül:
//   1. Lig/takım/oyuncu isim benzerliğini hesaplar.
//   2. Aynı entity için ülke benzerliğini hesaplar (varsa).
//   3. İkisinin ortalamasını (`combinedMatchScore`) tek bir güven skoruna
//      çevirir — ülke bilgisi eksikse sadece isim skoruna bakılır.
//   4. Skor eşiğin altında kalan adaylar "review" (belirsiz) olarak
//      işaretlenir — yanlış eşleştirmek yerine boş bırakılır.
//
// Yalnızca admin'in tetiklediği tarama zinciri tarafından çağrılır.
// ---------------------------------------------------------------------------

/** Bu skorun (0-100) altındaki eşleşmeler otomatik onaylanmaz, review kuyruğuna düşer. */
export const AUTO_MATCH_CONFIDENCE_THRESHOLD = 75

/** İsmi normalize eder: küçük harf, aksan/Türkçe karakter temizliği, noktalama/boşluk sadeleştirme. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    // Türkçe karakterleri sadeleştir
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    // Genel Latin aksanlarını kaldır (é, á, ñ, ø, æ vb.)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Kulüp isimlerinde anlamı olmayan ekleri at (FC, CF, SK, United, vb. çok agresif
    // olmasın diye sadece en yaygın önek/soneklere dokunuyoruz)
    .replace(/\b(fc|cf|sc|sk|ac|as|cd|ss|us|club|calcio)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Bir string'in karakter bigram'larını (ikili harf çiftleri) çıkarır. */
function bigrams(s: string): string[] {
  const clean = s.replace(/\s+/g, "")
  const result: string[] = []
  for (let i = 0; i < clean.length - 1; i++) {
    result.push(clean.slice(i, i + 2))
  }
  return result
}

/** Zaten normalize edilmiş iki string için Dice katsayısı (bigram overlap), 0-100. */
function rawBigramSimilarity(na: string, nb: string): number {
  if (!na || !nb) return 0
  if (na === nb) return 100

  const ba = bigrams(na)
  const bb = bigrams(nb)
  if (ba.length === 0 || bb.length === 0) {
    return na === nb ? 100 : 0
  }

  const bCounts = new Map<string, number>()
  for (const bg of bb) bCounts.set(bg, (bCounts.get(bg) ?? 0) + 1)

  let overlap = 0
  for (const bg of ba) {
    const count = bCounts.get(bg) ?? 0
    if (count > 0) {
      overlap++
      bCounts.set(bg, count - 1)
    }
  }

  const dice = (2 * overlap) / (ba.length + bb.length)
  return Math.round(dice * 100)
}

/**
 * İki isim arasındaki benzerliği Dice katsayısı (bigram overlap) ile 0-100
 * arası bir skora çevirir. Harici bir kütüphaneye gerek kalmadan, isim
 * eşleştirme için yeterince güvenilir bir yöntemdir.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  return rawBigramSimilarity(na, nb)
}

/**
 * Oyuncu isimleri için benzerlik skoru. API-Football isimleri çoğunlukla
 * kısaltılmış gelir (örn. "K. Ayhan"), Transfermarkt ise tam adı verir
 * (örn. "Kaan Ayhan"). Düz bigram benzerliği bu durumda çok düşük skor
 * üretir, bu yüzden soyadı odaklı bir skor da hesaplanıp ikisinin en
 * yükseği alınır.
 */
export function playerSimilarityScore(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  const fullScore = rawBigramSimilarity(na, nb)

  const ta = na.split(" ").filter(Boolean)
  const tb = nb.split(" ").filter(Boolean)
  if (ta.length === 0 || tb.length === 0) return fullScore

  const lastA = ta[ta.length - 1]
  const lastB = tb[tb.length - 1]
  const surnameScore = rawBigramSimilarity(lastA, lastB)

  // Soyadı hiç benzemiyorsa (farklı oyuncu olma ihtimali yüksek), düz skora güven.
  if (surnameScore < 60) return fullScore

  const firstA = ta[0]
  const firstB = tb[0]
  let firstNameBonus = 0
  if (firstA.length <= 2 || firstB.length <= 2) {
    // Biri kısaltma ("k" gibi) — ilk harf eşleşiyorsa bonus ver.
    firstNameBonus = firstA[0] === firstB[0] ? 25 : 0
  } else {
    firstNameBonus = Math.round(rawBigramSimilarity(firstA, firstB) * 0.25)
  }

  const combined = Math.min(100, Math.round(surnameScore * 0.75) + firstNameBonus)
  return Math.max(fullScore, combined)
}

/**
 * İki ülke adı arasındaki benzerliği 0-100 skora çevirir. `toTurkishCountry`
 * ile normalize edilir (İngilizce/Türkçe farkını gidermek için), sonra tam
 * eşleşme veya bigram benzerliği kullanılır.
 */
export function countrySimilarityScore(a: string, b: string): number {
  const na = normalizeName(toTurkishCountry(a))
  const nb = normalizeName(toTurkishCountry(b))
  if (na === nb) return 100
  return rawBigramSimilarity(na, nb)
}

/**
 * İsim skoru ile (varsa) ülke skorunun ortalamasını alır. Ülke bilgisi her
 * iki tarafta da mevcutsa `(nameScore + countryScore) / 2`, eksikse
 * (API-Football veya Transfermarkt tarafında null) sadece `nameScore`
 * kullanılır — veri eksikliği cezalandırılmaz.
 */
export function combinedMatchScore(nameScore: number, countryScore: number | null): number {
  if (countryScore === null) return Math.round(nameScore)
  return Math.round((nameScore + countryScore) / 2)
}

// ---------------------------------------------------------------------------
// Lig eşleştirme
// ---------------------------------------------------------------------------

export interface LeagueMatchResult {
  nameMatchPercent: number
  countryMatchPercent: number | null
  matchPercent: number
  /** "matched" | "review" — lig kodu eşlemesi sabit olduğundan "unmatched" yok. */
  matchStatus: "matched" | "review"
}

/**
 * Lig eşlemesi kod bazlı (LEAGUE_TO_TRANSFERMARKT_CODE) SABİT olduğu için
 * burada bir "aday havuzu" aranmaz — sadece bu sabit eşlemenin isim/ülke
 * açısından hâlâ tutarlı görünüp görünmediği admin'e sinyal olarak hesaplanır.
 */
export function matchLeague(
  apiFootballName: string,
  apiFootballCountry: string | null,
  transfermarktName: string | null,
  transfermarktCountry: string | null,
): LeagueMatchResult {
  const nameMatchPercent = transfermarktName ? similarityScore(apiFootballName, transfermarktName) : 0
  const countryMatchPercent =
    apiFootballCountry && transfermarktCountry ? countrySimilarityScore(apiFootballCountry, transfermarktCountry) : null
  const matchPercent = combinedMatchScore(nameMatchPercent, countryMatchPercent)
  return {
    nameMatchPercent,
    countryMatchPercent,
    matchPercent,
    matchStatus: matchPercent >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? "matched" : "review",
  }
}

// ---------------------------------------------------------------------------
// Takım eşleştirme
// ---------------------------------------------------------------------------

export interface ApiFootballTeamRef {
  id: number
  name: string
  country: string | null
}

export interface TeamMatchResult {
  apiFootballTeamId: number
  apiFootballTeamName: string
  transfermarktTeamId: string | null
  transfermarktTeamName: string | null
  transfermarktTeamCountry: string | null
  totalValueEur: number | null
  nameMatchPercent: number
  countryMatchPercent: number | null
  confidence: number
  status: "matched" | "review" | "unmatched"
}

/**
 * Bir ligin API-Football takım listesini çeker.
 *
 * Bilerek /standings DEĞİL /teams (getLeagueTeams) kullanılıyor — standings,
 * sezonun henüz oynanmamış/kayda geçmemiş bir maçı olan takımı (örn. sezon
 * başında fikstürü ertelenen ya da yeni terfi eden bir takım) listeden
 * tamamen atlıyordu. Bu da o takımın (ve tüm kadrosunun) piyasa değeri
 * taramasına hiç girmemesine sebep oluyordu.
 */
export async function getLeagueTeamsForMatching(leagueId: number, season: number): Promise<ApiFootballTeamRef[]> {
  const rows = await getLeagueTeams(leagueId, season)
  const seen = new Map<number, string>()
  for (const row of rows) {
    if (row.id && !seen.has(row.id)) {
      seen.set(row.id, row.name)
    }
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name, country: null }))
}

/**
 * API-Football takımlarını (bir lig içinde) Transfermarkt'tan scrape edilen
 * takımlarla en iyi isim+ülke benzerliğine göre eşleştirir. Her Transfermarkt
 * takımı en fazla bir API-Football takımına eşlenir (greedy, en yüksek
 * skordan başlayarak). `teamCountryMap` API-Football takım id'sinden ülkeye,
 * `transfermarktCountryMap` Transfermarkt takım id'sinden ülkeye eşlenir —
 * ikisi de opsiyoneldir (bulunamayan takım için skor sadece isme bakar).
 */
export function matchTeams(
  apiFootballTeams: ApiFootballTeamRef[],
  scrapedTeams: ScrapedTeam[],
  teamCountryMap: Map<number, string | null>,
  transfermarktCountryMap: Map<string, string | null>,
): TeamMatchResult[] {
  type Candidate = { af: ApiFootballTeamRef; tm: ScrapedTeam; nameScore: number; countryScore: number | null; score: number }
  const candidates: Candidate[] = []

  for (const af of apiFootballTeams) {
    const afCountry = teamCountryMap.get(af.id) ?? null
    for (const tm of scrapedTeams) {
      const tmCountry = transfermarktCountryMap.get(tm.transfermarktId) ?? null
      const nameScore = similarityScore(af.name, tm.name)
      const countryScore = afCountry && tmCountry ? countrySimilarityScore(afCountry, tmCountry) : null
      candidates.push({ af, tm, nameScore, countryScore, score: combinedMatchScore(nameScore, countryScore) })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const usedAf = new Set<number>()
  const usedTm = new Set<string>()
  const results = new Map<number, TeamMatchResult>()

  for (const c of candidates) {
    if (usedAf.has(c.af.id) || usedTm.has(c.tm.transfermarktId)) continue
    usedAf.add(c.af.id)
    usedTm.add(c.tm.transfermarktId)
    results.set(c.af.id, {
      apiFootballTeamId: c.af.id,
      apiFootballTeamName: c.af.name,
      transfermarktTeamId: c.tm.transfermarktId,
      transfermarktTeamName: c.tm.name,
      transfermarktTeamCountry: transfermarktCountryMap.get(c.tm.transfermarktId) ?? null,
      totalValueEur: c.tm.totalValueEur,
      nameMatchPercent: c.nameScore,
      countryMatchPercent: c.countryScore,
      confidence: c.score,
      status: c.score >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? "matched" : "review",
    })
  }

  // Hiç eşleşmeyen (aday havuzunda karşılığı çıkmayan) API-Football takımları
  for (const af of apiFootballTeams) {
    if (!results.has(af.id)) {
      results.set(af.id, {
        apiFootballTeamId: af.id,
        apiFootballTeamName: af.name,
        transfermarktTeamId: null,
        transfermarktTeamName: null,
        transfermarktTeamCountry: null,
        totalValueEur: null,
        nameMatchPercent: 0,
        countryMatchPercent: null,
        confidence: 0,
        status: "unmatched",
      })
    }
  }

  return Array.from(results.values())
}

// ---------------------------------------------------------------------------
// Oyuncu eşleştirme (takım içi arama ile)
// ---------------------------------------------------------------------------

export interface PlayerMatchResult {
  apiFootballPlayerId: number
  apiFootballPlayerName: string
  /** API-Football uyruğu — sadece TM tarafında uyruk bulunup ülke karşılaştırması yapıldığında dolu gelir. */
  apiFootballPlayerCountry: string | null
  transfermarktPlayerId: string | null
  transfermarktPlayerName: string | null
  transfermarktPlayerCountry: string | null
  valueEur: number | null
  nameMatchPercent: number
  countryMatchPercent: number | null
  confidence: number
  status: "matched" | "review" | "unmatched"
}

/**
 * Bir takımın API-Football kadrosunu Transfermarkt kadrosuyla eşleştirir.
 * Arama SADECE bu takımın kadrosu içinde yapılır (takım zaten eşleşmiş
 * olduğu için), bu yüzden binlerce oyuncu arasında değil, ~25 oyuncu
 * arasında karşılaştırma yapılır. Uyruk, `scrapedPlayers`'ın kadro
 * satırından zaten okunmuş halidir (bkz. scrapeTeamSquad) — burada API-Football
 * tarafı için SADECE eşleşen ~25 oyuncudan `transfermarktPlayerId`
 * bulunamayanlar için tek tek `getPlayerNationality` çağrılmaz; ülke
 * karşılaştırması yalnızca Transfermarkt satırında uyruk mevcutsa yapılır ve
 * API-Football tarafı gerektiğinde `getPlayerNationality` ile (nadiren, tek
 * seferde) tamamlanır.
 */
export async function matchPlayersForTeam(
  apiFootballTeamId: number,
  scrapedPlayers: ScrapedPlayer[],
  season: number,
): Promise<PlayerMatchResult[]> {
  const squad = await getSquad(apiFootballTeamId)

  type Candidate = {
    af: { id: number; name: string }
    tm: ScrapedPlayer
    afCountry: string | null
    nameScore: number
    countryScore: number | null
    score: number
  }
  const candidates: Candidate[] = []

  // API-Football tarafının uyruğu `getSquad`'da yer almıyor — sadece
  // Transfermarkt'ın uyruk bulduğu (satırdan okunan) oyuncular için, o
  // oyuncunun API-Football uyruğu tek seferde (`getPlayerNationality`) çekilir.
  const afCountryCache = new Map<number, string | null>()
  async function getAfCountry(playerId: number): Promise<string | null> {
    if (afCountryCache.has(playerId)) return afCountryCache.get(playerId) ?? null
    const country = await getPlayerNationality(playerId, season)
    afCountryCache.set(playerId, country)
    return country
  }

  for (const af of squad) {
    if (!af.id) continue
    for (const tm of scrapedPlayers) {
      const nameScore = playerSimilarityScore(af.name, tm.name)
      let countryScore: number | null = null
      let afCountry: string | null = null
      if (tm.nationality) {
        afCountry = await getAfCountry(af.id)
        countryScore = afCountry ? countrySimilarityScore(afCountry, tm.nationality) : null
      }
      candidates.push({
        af: { id: af.id, name: af.name },
        tm,
        afCountry,
        nameScore,
        countryScore,
        score: combinedMatchScore(nameScore, countryScore),
      })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const usedAf = new Set<number>()
  const usedTm = new Set<string>()
  const results = new Map<number, PlayerMatchResult>()

  for (const c of candidates) {
    if (usedAf.has(c.af.id) || usedTm.has(c.tm.transfermarktId)) continue
    usedAf.add(c.af.id)
    usedTm.add(c.tm.transfermarktId)
    results.set(c.af.id, {
      apiFootballPlayerId: c.af.id,
      apiFootballPlayerName: c.af.name,
      apiFootballPlayerCountry: c.afCountry,
      transfermarktPlayerId: c.tm.transfermarktId,
      transfermarktPlayerName: c.tm.name,
      transfermarktPlayerCountry: c.tm.nationality,
      valueEur: c.tm.valueEur,
      nameMatchPercent: c.nameScore,
      countryMatchPercent: c.countryScore,
      confidence: c.score,
      status: c.score >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? "matched" : "review",
    })
  }

  for (const af of squad) {
    if (!af.id) continue
    if (!results.has(af.id)) {
      results.set(af.id, {
        apiFootballPlayerId: af.id,
        apiFootballPlayerName: af.name,
        apiFootballPlayerCountry: null,
        transfermarktPlayerId: null,
        transfermarktPlayerName: null,
        transfermarktPlayerCountry: null,
        valueEur: null,
        nameMatchPercent: 0,
        countryMatchPercent: null,
        confidence: 0,
        status: "unmatched",
      })
    }
  }

  return Array.from(results.values())
}
