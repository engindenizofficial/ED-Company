// ---------------------------------------------------------------------------
// Poisson tabanlı istatistiksel skor modeli
// ---------------------------------------------------------------------------
// LLM'ler skor tahmininde sistematik olarak "makul görünen" küçük skorlara
// (1-0, 2-1, 1-1 gibi) yönelme eğilimindedir ve gerçek gol ortalamalarını
// sayısal olarak doğru bir dağılıma dökemez. Bu modül, takımların maç başına
// attığı/yediği gol ortalamalarından (mümkünse ev/deplasman ayrımıyla) beklenen
// gol sayısını (xG benzeri) hesaplar ve Poisson dağılımıyla en olası skoru,
// maç sonucu olasılıklarını, BTTS ve 2.5 üst/alt olasılıklarını üretir.
//
// Bu, ensemble'a LLM'lerden bağımsız, tamamen veri odaklı bir "oy" olarak
// eklenir — hem doğrudan nihai tahmine katkı sağlar hem de LLM prompt'larına
// somut bir referans noktası (xG) verir.
// ---------------------------------------------------------------------------

export interface GoalRate {
  goalsForAvg: number
  goalsAgainstAvg: number
}

const MAX_GOALS = 8

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k)
}

/**
 * İki takımın gol ortalamalarından beklenen gol sayısını (xG benzeri) çıkarır.
 * Ev sahibinin hücumu ile deplasmanın defansının, deplasmanın hücumu ile ev
 * sahibinin defansının ortalaması alınır — klasik "attack vs. opponent defense"
 * yaklaşımı. Ev sahibi/deplasman split verisi yoksa genel ortalamaya düşer.
 */
export function computeExpectedGoals(
  homeOverall: GoalRate | null | undefined,
  awayOverall: GoalRate | null | undefined,
  homeVenueSplit: GoalRate | null | undefined,
  awayVenueSplit: GoalRate | null | undefined,
): { homeXG: number; awayXG: number } {
  const homeAttack = homeVenueSplit?.goalsForAvg ?? homeOverall?.goalsForAvg ?? 1.2
  const homeDefense = homeVenueSplit?.goalsAgainstAvg ?? homeOverall?.goalsAgainstAvg ?? 1.2
  const awayAttack = awayVenueSplit?.goalsForAvg ?? awayOverall?.goalsForAvg ?? 1.0
  const awayDefense = awayVenueSplit?.goalsAgainstAvg ?? awayOverall?.goalsAgainstAvg ?? 1.4

  // Alt sınır koy — sıfıra yakın ortalamalar (az maç oynanmış / veri eksik)
  // Poisson dağılımını bozup gerçekçi olmayan 0-0 baskısı yaratmasın.
  const homeXG = Math.max(0.3, (homeAttack + awayDefense) / 2)
  const awayXG = Math.max(0.25, (awayAttack + homeDefense) / 2)

  return { homeXG, awayXG }
}

export interface PoissonPrediction {
  homeScore: number
  awayScore: number
  winner: "home" | "away" | "draw"
  confidence: number
  btts: boolean
  overUnder: "over" | "under"
  keyFactors: string[]
  homeXG: number
  awayXG: number
}

/**
 * xG çiftinden en olası skoru ve türetilmiş bahis piyasası olasılıklarını
 * hesaplar. Grid üzerinde ortak olasılığı en yüksek olan (i, j) skoru bulur;
 * bu "beklenen gol ortalaması"nı yuvarlamaktan (örn. 1.4-1.6 → 1-2 yerine
 * her zaman 1-1) çok daha gerçekçi bir skor dağılımı üretir.
 */
export function predictFromExpectedGoals(homeXG: number, awayXG: number): PoissonPrediction {
  let bestI = 0
  let bestJ = 0
  let bestP = -1

  let homeWinP = 0
  let drawP = 0
  let awayWinP = 0
  let bttsP = 0
  let over25P = 0

  for (let i = 0; i <= MAX_GOALS; i++) {
    const pi = poissonPmf(i, homeXG)
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pj = poissonPmf(j, awayXG)
      const p = pi * pj

      if (p > bestP) {
        bestP = p
        bestI = i
        bestJ = j
      }

      if (i > j) homeWinP += p
      else if (i === j) drawP += p
      else awayWinP += p

      if (i >= 1 && j >= 1) bttsP += p
      if (i + j > 2.5) over25P += p
    }
  }

  const winner: "home" | "away" | "draw" =
    homeWinP >= drawP && homeWinP >= awayWinP ? "home" : awayWinP >= drawP ? "away" : "draw"

  const confidence = Math.round(Math.max(homeWinP, drawP, awayWinP) * 100)

  return {
    homeScore: bestI,
    awayScore: bestJ,
    winner,
    confidence: Math.min(95, Math.max(20, confidence)),
    btts: bttsP >= 0.5,
    overUnder: over25P >= 0.5 ? "over" : "under",
    keyFactors: [
      `İstatistiksel model: beklenen gol ${homeXG.toFixed(2)}-${awayXG.toFixed(2)} (Poisson dağılımı)`,
    ],
    homeXG,
    awayXG,
  }
}
