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

/** Ensemble'ın (AI modelleri + istatistik modeli) uzatma/penaltı konusundaki
 * ağırlıklı ortak görüşü — bkz. app/api/predict/route.ts `weightedVote`. Bu
 * modül artık uzatma golünü veya penaltı skorunu KENDİ HESAPLAMIYOR; sadece
 * ensemble'ın zaten ürettiği tahmini, agregat aritmetiğine uygulayıp turu
 * geçen tarafı belirliyor. */
export interface EnsembleTieVote {
  extraTimeHomeGoals: number
  extraTimeAwayGoals: number
  wentToPenalties: boolean
  penaltyHomeGoals: number
  penaltyAwayGoals: number
}

/**
 * 90 dakika sonundaki toplam skoru (agregat) alır; berabereyse ensemble'ın
 * kendi uzatma tahminini agregata ekler, hâlâ berabereyse ensemble'ın
 * penaltı tahminini kullanarak turu geçen tarafı belirler. Uzatma golü ve
 * penaltı skoru artık xG/oran gibi ayrı bir istatistik formülünden değil,
 * doğrudan AI modellerinin (+ istatistik modelinin) kendi tahmininden gelir
 * — bu fonksiyon sadece agregat aritmetiğini ve "kazanan kim" mantığını
 * uygular.
 */
export function resolveKnockoutTie(
  aggregateHomeBefore: number,
  aggregateAwayBefore: number,
  ensembleTie: EnsembleTieVote,
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

  // Agregat berabere — uzatmaya gidiyor. Uzatma golleri ensemble'ın kendi
  // tahminidir (bkz. PredictionSchema.extraTimeHomeGoals/AwayGoals).
  const extraTimeHomeGoals = ensembleTie.extraTimeHomeGoals
  const extraTimeAwayGoals = ensembleTie.extraTimeAwayGoals

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

  // Uzatmada da berabere — penaltılar. Skor ve kazanan taraf ensemble'ın
  // kendi penaltı tahminidir. Gerçek penaltılarda beraberlik olamayacağı
  // için, ensemble'ın iki skoru eşit çıkması gibi bir uçta durum varsa
  // (nadiren, ağırlıklı ortalama sonucu) kazanan tarafa +1 eklenerek kural
  // ihlali giderilir.
  let penaltyHomeGoals = ensembleTie.penaltyHomeGoals
  let penaltyAwayGoals = ensembleTie.penaltyAwayGoals
  let advancing: "home" | "away" = penaltyHomeGoals >= penaltyAwayGoals ? "home" : "away"
  if (penaltyHomeGoals === penaltyAwayGoals) {
    if (advancing === "home") penaltyHomeGoals += 1
    else penaltyAwayGoals += 1
  }

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

/** Bahis oranlarından ev sahibinin mi deplasmanın mı favori olduğunu çıkarır (düşük oran = favori). */
export function oddsFavoredSide(odds: { home: number | null; away: number | null }): boolean | null {
  if (odds.home == null || odds.away == null) return null
  if (odds.home < odds.away) return true
  if (odds.away < odds.home) return false
  return null
}
