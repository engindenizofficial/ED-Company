// ---------------------------------------------------------------------------
// Poisson tabanlı istatistiksel skor modeli
// ---------------------------------------------------------------------------
// LLM'ler skor tahmininde sistematik olarak "makul görünen" küçük skorlara
// (1-0, 2-1, 1-1 gibi) yönelme eğilimindedir ve gerçek gol ortalamalarını
// sayısal olarak doğru bir dağılıma dökemez. Bu modül, takımların maç başına
// attığı/yediği gol ortalamalarından (mümkünse ev/deplasman ayrımıyla) beklenen
// gol sayısını (xG benzeri) hesaplar; buna kafa-kafaya geçmiş ve piyasa
// oranlarından gelen sinyalleri harmanlar; Dixon-Coles düşük-skor düzeltmesi
// uygulayarak en olası skoru, maç sonucu olasılıklarını, BTTS ve 2.5 üst/alt
// olasılıklarını üretir.
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

// Dixon-Coles düşük-skor korelasyon parametresi. Gerçek futbol maçlarında
// 0-0 ve 1-1 gibi düşük skorlar, takımların bağımsız Poisson süreçleri
// varsayımının öngördüğünden biraz daha sık görülür (savunma ağırlıklı oyun,
// erken gol sonrası oyun disiplini vb.). Literatürde tipik değer -0.10/-0.15
// aralığındadır; -0.12 makul bir orta nokta.
const DIXON_COLES_RHO = -0.12

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k)
}

/** Dixon-Coles tau düzeltmesi — sadece (0,0),(0,1),(1,0),(1,1) hücrelerini etkiler. */
function dixonColesTau(i: number, j: number, lambda: number, mu: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho
  if (i === 0 && j === 1) return 1 + lambda * rho
  if (i === 1 && j === 0) return 1 + mu * rho
  if (i === 1 && j === 1) return 1 - rho
  return 1
}

/** i=0..MAX_GOALS, j=0..MAX_GOALS için ortak (Dixon-Coles düzeltmeli, normalize) olasılık ızgarası. */
function buildScoreGrid(homeXG: number, awayXG: number, rho = DIXON_COLES_RHO): number[][] {
  const grid: number[][] = []
  let total = 0
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row: number[] = []
    const pi = poissonPmf(i, homeXG)
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pj = poissonPmf(j, awayXG)
      const tau = dixonColesTau(i, j, homeXG, awayXG, rho)
      const p = Math.max(0, pi * pj * tau)
      row.push(p)
      total += p
    }
    grid.push(row)
  }
  // Tau düzeltmesi sadece birkaç hücreyi değiştirdiği için toplam 1'den
  // sapabilir — tüm ızgarayı yeniden normalize ediyoruz.
  if (total > 0) {
    for (let i = 0; i <= MAX_GOALS; i++) {
      for (let j = 0; j <= MAX_GOALS; j++) grid[i][j] /= total
    }
  }
  return grid
}

function probsFromGrid(grid: number[][]): { home: number; draw: number; away: number } {
  let home = 0
  let draw = 0
  let away = 0
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = grid[i][j]
      if (i > j) home += p
      else if (i === j) draw += p
      else away += p
    }
  }
  return { home, draw, away }
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

export interface H2HGoalInput {
  /** Bu güncel fikstürün ev sahibi takımının o geçmiş maçta attığı gol. */
  homeTeamGoals: number
  /** Bu güncel fikstürün deplasman takımının o geçmiş maçta attığı gol. */
  awayTeamGoals: number
}

/**
 * Kafa-kafaya geçmiş maçlardaki gol ortalamasını, sezon istatistiklerinden
 * gelen xG ile harmanlar. H2H örneklem küçük olduğundan (genelde ≤8 maç) ve
 * gürültüye açık olduğundan düşük bir ağırlıkla (varsayılan %15) katkı verir —
 * amaç ana istatistiği domine etmek değil, rekabet geçmişindeki (örn. bir
 * takımın rakibine karşı sistematik olarak az/çok gol bulması gibi) sistematik
 * eğilimi hafifçe hesaba katmaktır.
 */
export function blendWithH2H(
  homeXG: number,
  awayXG: number,
  h2h: H2HGoalInput[],
  h2hWeight = 0.15,
): { homeXG: number; awayXG: number } {
  if (h2h.length < 3) return { homeXG, awayXG }

  const sample = h2h.slice(0, 6)
  const h2hHomeAvg = sample.reduce((s, g) => s + g.homeTeamGoals, 0) / sample.length
  const h2hAwayAvg = sample.reduce((s, g) => s + g.awayTeamGoals, 0) / sample.length

  // Örneklem ne kadar küçükse H2H'ye o kadar az güven — 3 maçta ağırlığın
  // yarısı, 6+ maçta tam ağırlık uygulanır.
  const sampleConfidence = Math.min(1, sample.length / 6)
  const w = h2hWeight * sampleConfidence

  return {
    homeXG: Math.max(0.2, homeXG * (1 - w) + h2hHomeAvg * w),
    awayXG: Math.max(0.15, awayXG * (1 - w) + h2hAwayAvg * w),
  }
}

export interface MarketOdds {
  home: number | null
  draw: number | null
  away: number | null
}

/** Ondalık oranlardan overround'u temizlenmiş (normalize) örtük olasılıklar. */
function impliedProbsFromOdds(odds: MarketOdds): { home: number; draw: number; away: number } | null {
  if (!odds.home || !odds.draw || !odds.away) return null
  const rawHome = 1 / odds.home
  const rawDraw = 1 / odds.draw
  const rawAway = 1 / odds.away
  const total = rawHome + rawDraw + rawAway
  if (!Number.isFinite(total) || total <= 0) return null
  return { home: rawHome / total, draw: rawDraw / total, away: rawAway / total }
}

/**
 * Poisson istatistik modelinin xG'sini, piyasa oranlarının örtük 1X2
 * olasılıklarına yaklaşacak şekilde küçük bir ızgara araması ile kalibre eder.
 * Piyasa oranları; sakatlık, motivasyon, hava durumu, iç saha baskısı gibi
 * modelin görmediği birçok sinyali fiyatlara zaten yedirmiş olduğundan, salt
 * gol ortalamalarına dayanan istatistiksel modelden genelde daha isabetlidir.
 * Ölçekleme faktörleri makul bir aralıkla (0.55-1.75) sınırlandırılır ki
 * istatistiksel temel tamamen piyasaya feda edilmesin — sadece ona doğru
 * çekilsin.
 */
export function calibrateExpectedGoalsToOdds(
  homeXG: number,
  awayXG: number,
  odds: MarketOdds,
): { homeXG: number; awayXG: number } {
  const market = impliedProbsFromOdds(odds)
  if (!market) return { homeXG, awayXG }

  const scaleSteps = [0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75]

  let bestHomeScale = 1
  let bestAwayScale = 1
  let bestError = Number.POSITIVE_INFINITY

  for (const hs of scaleSteps) {
    for (const as of scaleSteps) {
      const grid = buildScoreGrid(homeXG * hs, awayXG * as)
      const probs = probsFromGrid(grid)
      const error =
        (probs.home - market.home) ** 2 + (probs.draw - market.draw) ** 2 + (probs.away - market.away) ** 2
      if (error < bestError) {
        bestError = error
        bestHomeScale = hs
        bestAwayScale = as
      }
    }
  }

  return {
    homeXG: Math.max(0.2, homeXG * bestHomeScale),
    awayXG: Math.max(0.15, awayXG * bestAwayScale),
  }
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
 * hesaplar. Dixon-Coles düzeltmeli grid üzerinde ortak olasılığı en yüksek
 * olan (i, j) skoru bulur; bu "beklenen gol ortalaması"nı yuvarlamaktan
 * (örn. 1.4-1.6 → 1-2 yerine her zaman 1-1) çok daha gerçekçi bir skor
 * dağılımı üretir.
 */
export function predictFromExpectedGoals(homeXG: number, awayXG: number): PoissonPrediction {
  const grid = buildScoreGrid(homeXG, awayXG)

  let bestI = 0
  let bestJ = 0
  let bestP = -1
  let bttsP = 0
  let over25P = 0

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = grid[i][j]
      if (p > bestP) {
        bestP = p
        bestI = i
        bestJ = j
      }
      if (i >= 1 && j >= 1) bttsP += p
      if (i + j > 2.5) over25P += p
    }
  }

  const { home: homeWinP, draw: drawP, away: awayWinP } = probsFromGrid(grid)

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
      `İstatistiksel model: beklenen gol ${homeXG.toFixed(2)}-${awayXG.toFixed(2)} (Poisson + Dixon-Coles)`,
    ],
    homeXG,
    awayXG,
  }
}
