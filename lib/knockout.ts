// ---------------------------------------------------------------------------
// Eleme usulü (knockout) tur tespiti + çift/çok ayaklı toplam skor (agregat)
// + uzatma/penaltı çözümlemesi.
// ---------------------------------------------------------------------------
// Lig usulü (round-robin) maçlarda beraberlik nihai bir sonuçtur. Eleme usulü
// turlarda (Play-off, Round of 16, Çeyrek Final, Final, çift ayaklı turlar
// vb.) beraberlik NİHAİ SONUÇ OLAMAZ — illa bir taraf turu geçer. Bu modül:
//
// 1. API-Football'un `league.round` metninden turun eleme usulü olup
//    olmadığını ve kaçıncı ayak olduğunu çıkarır.
// 2. Çift/çok ayaklı turlarda H2H verisinden önceki ayağın skorunu bulur
//    (doğru ev/deplasman etiketiyle — ilk ayakta ev sahibi/deplasman genelde
//    bu maçın tersidir).
// 3. Son ayak berabere kalırsa (toplam skor / agregat eşitse) uzatma, hâlâ
//    eşitse penaltı çözümlemesi yaparak turu kimin geçtiğini belirler.
// ---------------------------------------------------------------------------

import type { Fixture, FormGame } from "@/lib/types"

export interface RoundInfo {
  /** API-Football'un ham round metni, örn: "Play-offs - 2nd Leg" */
  raw: string | undefined
  /** Bu maçın kaçıncı ayak olduğu (1, 2, 3...) — round metninde ayak bilgisi yoksa null */
  leg: number | null
  /** Round metni eleme (grup/lig usulü olmayan) bir tur mu */
  isKnockoutStage: boolean
  /** true ise bu maç turun KESİN kazananının belirlendiği maçtır — 90 dakika
   * sonunda (agregat dahil) berabere kalırsa uzatma/penaltı devreye girer.
   * Tek ayaklı eleme turları (final, tek maçlık play-off) ve bilinen son ayak
   * (2. ayak, 3. ayak...) için true; 1. ayak için false (tur henüz bitmez). */
  isDecidingMatch: boolean
}

// Bu ifadeler geçiyorsa round bir lig/grup usulü turdur (beraberlik normal
// bir sonuçtur, eleme mantığı uygulanmaz).
const GROUP_OR_LEAGUE_PATTERNS = [/regular season/i, /group stage/i, /grup\s*(a?şaması|abı)/i, /league stage/i]

// "1st Leg", "2nd Leg", "3rd Leg", "1. Ayak" gibi ifadelerden ayak numarasını çıkarır.
const LEG_PATTERN = /(\d+)(?:st|nd|rd|th)?\s*(?:leg|ayak)/i

export function parseRoundInfo(round: string | undefined): RoundInfo {
  if (!round) return { raw: round, leg: null, isKnockoutStage: false, isDecidingMatch: false }

  const isGroupOrLeague = GROUP_OR_LEAGUE_PATTERNS.some((p) => p.test(round))
  const legMatch = round.match(LEG_PATTERN)
  const leg = legMatch ? Number(legMatch[1]) : null

  // Grup/lig usulü değilse eleme turu kabul ediyoruz (Play-off, Round of 16,
  // Çeyrek/Yarı Final, Final, Qualifying Round, çift ayaklı turlar dahil).
  const isKnockoutStage = !isGroupOrLeague

  // 1. ayakta tur henüz bitmez (2. ayak oynanacak) — deciding değil.
  // Ayak bilgisi yoksa (tek maçlık final/play-off) veya 2. ayak+ ise deciding.
  const isDecidingMatch = isKnockoutStage && (leg === null || leg >= 2)

  return { raw: round, leg, isKnockoutStage, isDecidingMatch }
}

export interface FirstLegResult {
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  date: string
}

/**
 * H2H listesinden bu maçtan önceki en yakın karşılaşmayı (muhtemel ilk ayak)
 * bulur. `h2h` her zaman güncel fikstürün ev sahibi takımı bakış açısından
 * `scored`/`conceded` taşır (bkz. api-football.ts getHeadToHead) — bu yüzden
 * gerçek ev/deplasman etiketini `g.home` + `g.homeTeam`/`g.awayTeam`
 * alanlarından çıkarıyoruz (analysis-panel'deki formatH2H ile aynı mantık).
 *
 * İki takım arasında son 60 gün içinde oynanmış en yakın maçı ilk ayak kabul
 * ediyoruz — daha eski bir eşleşme muhtemelen farklı bir sezon/turnuvadır.
 */
export function findFirstLegResult(h2h: FormGame[], fixture: Fixture): FirstLegResult | null {
  const currentDate = new Date(fixture.date).getTime()

  const candidates = h2h
    .filter((g) => new Date(g.date).getTime() < currentDate)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (candidates.length === 0) return null
  const prev = candidates[0]

  const daysBetween = (currentDate - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24)
  if (daysBetween > 60) return null

  const homeGoals = prev.home ? prev.scored : prev.conceded
  const awayGoals = prev.home ? prev.conceded : prev.scored

  return {
    homeTeam: prev.homeTeam ?? (prev.home ? fixture.home.name : fixture.away.name),
    awayTeam: prev.awayTeam ?? (prev.home ? fixture.away.name : fixture.home.name),
    homeScore: homeGoals,
    awayScore: awayGoals,
    date: prev.date,
  }
}

/**
 * İlk ayak sonucunu, bu fikstürün ev/deplasman etiketine göre çevirir —
 * ilk ayakta ev sahibi/deplasman genelde bu maçın TERSİDİR.
 * Döndürülen değerler: ilk ayakta bu maçın ev sahibinin ve deplasmanının
 * attığı gol sayısı.
 */
export function reorientFirstLeg(
  firstLeg: FirstLegResult,
  currentHomeName: string,
): { firstLegGoalsForCurrentHome: number; firstLegGoalsForCurrentAway: number } {
  const sameOrientation = firstLeg.homeTeam === currentHomeName
  return sameOrientation
    ? { firstLegGoalsForCurrentHome: firstLeg.homeScore, firstLegGoalsForCurrentAway: firstLeg.awayScore }
    : { firstLegGoalsForCurrentHome: firstLeg.awayScore, firstLegGoalsForCurrentAway: firstLeg.homeScore }
}

export interface TieResolution {
  aggregateHome: number
  aggregateAway: number
  wentToExtraTime: boolean
  wentToPenalties: boolean
  /** Turu geçen taraf — bu fikstürün ev/deplasman etiketine göre */
  advancing: "home" | "away"
  extraTimeHomeGoals: number
  extraTimeAwayGoals: number
  /** Penaltı atışları skoru (varsa) — kazanan taraf her zaman 5+ atıştan sonra
   * rakibinden en az 1 fazla golle öndedir (gerçek penaltı kurallarına uygun:
   * 5-4, 4-3, 5-3 vb. — asla 5-5 gibi beraberlik olmaz). */
  penaltyHomeGoals?: number
  penaltyAwayGoals?: number
}

/**
 * 90 dakika sonundaki toplam skoru (agregat) alır; berabereyse uzatma,
 * uzatmada da berabereyse penaltı çözümlemesi yaparak turu geçen tarafı
 * belirler. `homeXG`/`awayXG` bu maç için hesaplanmış beklenen gol
 * değerleridir — uzatma (30 dk) beklenen golü bunun 1/3'ü oranında
 * ölçeklenerek tahmin edilir.
 */
export function resolveKnockoutTie(
  aggregateHomeBefore: number,
  aggregateAwayBefore: number,
  homeXG: number,
  awayXG: number,
  oddsHomeFavored: boolean | null,
): TieResolution {
  if (aggregateHomeBefore !== aggregateAwayBefore) {
    return {
      aggregateHome: aggregateHomeBefore,
      aggregateAway: aggregateAwayBefore,
      wentToExtraTime: false,
      wentToPenalties: false,
      advancing: aggregateHomeBefore > aggregateAwayBefore ? "home" : "away",
      extraTimeHomeGoals: 0,
      extraTimeAwayGoals: 0,
    }
  }

  // Agregat berabere — uzatmaya gidiyor. 30 dakikalık uzatmada beklenen gol,
  // 90 dakikalık xG'nin 1/3'ü kadar ölçeklenir. Belirgin bir güç farkı
  // (>= 0.35 xG) varsa güçlü tarafa 1 gol yazılır; aksi halde uzatma da
  // istatistiksel olarak en olası senaryo olan golsüz geçer.
  const etHomeXG = homeXG * (30 / 90)
  const etAwayXG = awayXG * (30 / 90)
  const xgDiff = etHomeXG - etAwayXG
  const ET_GOAL_THRESHOLD = 0.35

  let extraTimeHomeGoals = 0
  let extraTimeAwayGoals = 0
  if (xgDiff >= ET_GOAL_THRESHOLD) extraTimeHomeGoals = 1
  else if (xgDiff <= -ET_GOAL_THRESHOLD) extraTimeAwayGoals = 1

  const aggregateHome = aggregateHomeBefore + extraTimeHomeGoals
  const aggregateAway = aggregateAwayBefore + extraTimeAwayGoals

  if (aggregateHome !== aggregateAway) {
    return {
      aggregateHome,
      aggregateAway,
      wentToExtraTime: true,
      wentToPenalties: false,
      advancing: aggregateHome > aggregateAway ? "home" : "away",
      extraTimeHomeGoals,
      extraTimeAwayGoals,
    }
  }

  // Uzatmada da berabere — penaltılar. Penaltı atışları doğası gereği yüksek
  // varyanslıdır, "doğru" bir tahmin yoktur; mevcut sinyallerden (piyasa
  // favorisi, xG üstünlüğü, ev sahibi avantajı) hafif bir eğilim çıkarıyoruz.
  let advancing: "home" | "away"
  if (oddsHomeFavored === true) advancing = "home"
  else if (oddsHomeFavored === false) advancing = "away"
  else if (Math.abs(xgDiff) > 0.05) advancing = xgDiff > 0 ? "home" : "away"
  else advancing = "home" // istatistiksel olarak penaltılarda hafif ev sahibi avantajı

  const { penaltyHomeGoals, penaltyAwayGoals } = generatePenaltyScore(advancing, aggregateHomeBefore + aggregateAwayBefore)

  return {
    aggregateHome,
    aggregateAway,
    wentToExtraTime: true,
    wentToPenalties: true,
    advancing,
    extraTimeHomeGoals,
    extraTimeAwayGoals,
    penaltyHomeGoals,
    penaltyAwayGoals,
  }
}

// Standart penaltı atışları istatistiklerine dayalı gerçekçi skor dağılımı —
// profesyonel futbolda en sık görülen sonuçlar 5-4, 4-3, 5-3 ve 3-1 aralığındadır
// (ilk 5 atışın çoğu içeri girer, seri nadiren 6-7 atışa uzar). Kazanan taraf
// her zaman en az 1 gol öndedir; deterministik ama maça özgü bir seed kullanarak
// aynı maç için her zaman aynı sonucu üretiyoruz (rastgele değil).
function generatePenaltyScore(
  advancing: "home" | "away",
  seed: number,
): { penaltyHomeGoals: number; penaltyAwayGoals: number } {
  // Gerçek maçlardan derlenmiş yaygın penaltı skor dağılımı (kazanan-kaybeden gol sayısı)
  const OUTCOMES: Array<[number, number]> = [
    [5, 4],
    [4, 3],
    [5, 3],
    [3, 2],
    [4, 2],
    [5, 2],
    [3, 1],
    [6, 5],
  ]
  const idx = Math.abs(Math.round(seed * 37)) % OUTCOMES.length
  const [winnerGoals, loserGoals] = OUTCOMES[idx]

  return advancing === "home"
    ? { penaltyHomeGoals: winnerGoals, penaltyAwayGoals: loserGoals }
    : { penaltyHomeGoals: loserGoals, penaltyAwayGoals: winnerGoals }
}

/** Bahis oranlarından ev sahibinin mi deplasmanın mı favori olduğunu çıkarır (düşük oran = favori). */
export function oddsFavoredSide(odds: { home: number | null; away: number | null }): boolean | null {
  if (odds.home == null || odds.away == null) return null
  if (odds.home < odds.away) return true
  if (odds.away < odds.home) return false
  return null
}
