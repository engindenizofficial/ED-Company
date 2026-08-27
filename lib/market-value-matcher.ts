import { toTurkishCountry } from "./tr-aliases"

// ---------------------------------------------------------------------------
// İsim + ülke eşleştirme (fuzzy matching) katmanı.
//
// API-Football ve Transfermarkt birbirinden bağımsız veritabanları; ortak
// bir ID yok. Bu modül SAF (pure) çalışır — TM ve AF verisi taramanın
// önceki fazlarında (tm_leagues/tm_teams/tm_players, af_leagues/af_teams/
// af_players) zaten staging tablolarına yazılmış olur; bu modül hiçbir HTTP
// isteği yapmaz, sadece iki taraftan gelen isim/ülke/değer listelerini
// karşılaştırır:
//   1. Lig/takım/oyuncu isim benzerliğini hesaplar.
//   2. Aynı entity için ülke benzerliğini hesaplar (varsa).
//   3. İkisinin ortalamasını (`combinedMatchScore`) tek bir güven skoruna
//      çevirir — ülke bilgisi eksikse sadece isim skoruna bakılır.
//   4. Skor eşiğin altında kalan adaylar "review" (belirsiz) olarak
//      işaretlenir — yanlış eşleştirmek yerine boş bırakılır.
//
// Yalnızca admin'in tetiklediği tarama zinciri (matching fazı) tarafından
// çağrılır.
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

/** Bir taraftan (TM veya AF) gelen, tek bir varlığı (takım veya oyuncu) temsil eden genel satır. */
export interface StagedEntity {
  /** TM tarafında Transfermarkt id/slug, AF tarafında API-Football id'si (string'e çevrilmiş). */
  externalId: string
  name: string
  country: string | null
  /** Sadece TM tarafında dolu — AF kimlik verisi sunmadığı için piyasa değeri kavramı yok. */
  valueEur: number | null
}

export interface EntityMatchResult {
  af: StagedEntity | null
  tm: StagedEntity | null
  nameMatchPercent: number
  countryMatchPercent: number | null
  confidence: number
  /** "matched" | "review" | "unmatched" — "unmatched" sadece AF tarafında karşılığı olmayan TM adayları veya karşılığı hiç bulunamayan AF satırları için kullanılır. */
  status: "matched" | "review" | "unmatched"
}

/**
 * Bir tarafın (AF) varlıklarını diğer tarafın (TM) varlıklarıyla en iyi
 * isim+ülke benzerliğine göre eşleştirir. Her TM varlığı en fazla bir AF
 * varlığına eşlenir (greedy, en yüksek skordan başlayarak). Takım ve oyuncu
 * eşleştirmesinin ikisi de bu genel fonksiyonu kullanır — sadece
 * `nameScoreFn` değişir (oyuncular için `playerSimilarityScore`, takımlar
 * için `similarityScore`).
 */
export function matchStagedEntities(
  afEntities: StagedEntity[],
  tmEntities: StagedEntity[],
  nameScoreFn: (a: string, b: string) => number = similarityScore,
): EntityMatchResult[] {
  type Candidate = { af: StagedEntity; tm: StagedEntity; nameScore: number; countryScore: number | null; score: number }
  const candidates: Candidate[] = []

  for (const af of afEntities) {
    for (const tm of tmEntities) {
      const nameScore = nameScoreFn(af.name, tm.name)
      const countryScore = af.country && tm.country ? countrySimilarityScore(af.country, tm.country) : null
      candidates.push({ af, tm, nameScore, countryScore, score: combinedMatchScore(nameScore, countryScore) })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const usedAf = new Set<string>()
  const usedTm = new Set<string>()
  const results = new Map<string, EntityMatchResult>()

  for (const c of candidates) {
    if (usedAf.has(c.af.externalId) || usedTm.has(c.tm.externalId)) continue
    usedAf.add(c.af.externalId)
    usedTm.add(c.tm.externalId)
    results.set(c.af.externalId, {
      af: c.af,
      tm: c.tm,
      nameMatchPercent: c.nameScore,
      countryMatchPercent: c.countryScore,
      confidence: c.score,
      status: c.score >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? "matched" : "review",
    })
  }

  // Hiç eşleşmeyen (aday havuzunda karşılığı çıkmayan) AF varlıkları
  for (const af of afEntities) {
    if (!results.has(af.externalId)) {
      results.set(af.externalId, {
        af,
        tm: null,
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

/**
 * Bir takımın (zaten eşleşmiş olduğu için) staged AF kadrosunu, aynı takımın
 * staged TM kadrosuyla eşleştirir. Arama SADECE bu takımın kadrosu içinde
 * yapılır (binlerce oyuncu arasında değil, ~25 oyuncu arasında), isim
 * benzerliği için soyadı-ağırlıklı `playerSimilarityScore` kullanılır. AF
 * tarafında oyuncu uyruğu taranmaz (kota maliyeti yüksek, kimlik verisi için
 * gerekli değil) — bu yüzden ülke skoru burada her zaman `null` çıkar ve
 * eşleşme tamamen isme göre yapılır.
 */
export function matchPlayers(afPlayers: StagedEntity[], tmPlayers: StagedEntity[]): EntityMatchResult[] {
  return matchStagedEntities(afPlayers, tmPlayers, playerSimilarityScore)
}
