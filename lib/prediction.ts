import type { FormGame, Prediction, ScoreProbability, TeamForm } from "./types"

// League-average goals per team per match (baseline)
const LEAGUE_AVG = 1.35
// Home advantage multiplier applied to home expected goals
const HOME_ADVANTAGE = 1.12

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function h2hAdjustment(h2h: FormGame[]): number {
  // Positive favors home (perspective is home team in h2h list)
  if (h2h.length === 0) return 0
  let score = 0
  for (const g of h2h) {
    if (g.result === "W") score += 1
    else if (g.result === "L") score -= 1
  }
  return clamp(score / h2h.length, -0.35, 0.35)
}

export function buildPrediction(homeForm: TeamForm, awayForm: TeamForm, h2h: FormGame[]): Prediction {
  // Attack / defense strengths relative to league average, using venue-specific data
  const homeAttack = (homeForm.homeAvgScored || homeForm.avgScored || LEAGUE_AVG) / LEAGUE_AVG
  const homeDefense = (homeForm.homeAvgConceded || homeForm.avgConceded || LEAGUE_AVG) / LEAGUE_AVG
  const awayAttack = (awayForm.awayAvgScored || awayForm.avgScored || LEAGUE_AVG) / LEAGUE_AVG
  const awayDefense = (awayForm.awayAvgConceded || awayForm.avgConceded || LEAGUE_AVG) / LEAGUE_AVG

  const h2hAdj = h2hAdjustment(h2h)

  let expectedGoalsHome = LEAGUE_AVG * homeAttack * awayDefense * HOME_ADVANTAGE * (1 + h2hAdj * 0.5)
  let expectedGoalsAway = LEAGUE_AVG * awayAttack * homeDefense * (1 - h2hAdj * 0.5)

  expectedGoalsHome = clamp(expectedGoalsHome, 0.2, 4.5)
  expectedGoalsAway = clamp(expectedGoalsAway, 0.2, 4.5)

  // Build score matrix up to 6 goals each
  const maxGoals = 6
  let homeWin = 0
  let draw = 0
  let awayWin = 0
  let over25 = 0
  let btts = 0
  const scoreProbs: ScoreProbability[] = []

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poisson(h, expectedGoalsHome) * poisson(a, expectedGoalsAway)
      scoreProbs.push({ home: h, away: a, probability: p })
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
      if (h + a > 2) over25 += p
      if (h > 0 && a > 0) btts += p
    }
  }

  const total = homeWin + draw + awayWin || 1
  const homeWinPct = (homeWin / total) * 100
  const drawPct = (draw / total) * 100
  const awayWinPct = (awayWin / total) * 100

  scoreProbs.sort((a, b) => b.probability - a.probability)
  const topScores = scoreProbs.slice(0, 5)
  const mostLikelyScore = { home: topScores[0].home, away: topScores[0].away }

  const verdict: "home" | "draw" | "away" =
    homeWinPct >= drawPct && homeWinPct >= awayWinPct
      ? "home"
      : awayWinPct >= drawPct
        ? "away"
        : "draw"

  const topPct = Math.max(homeWinPct, drawPct, awayWinPct)
  const confidence = clamp(Math.round((topPct - 33.3) * 1.5 + topScores[0].probability * 100), 20, 92)

  const report = buildReport(homeForm, awayForm, h2h, {
    expectedGoalsHome,
    expectedGoalsAway,
    homeWinPct,
    drawPct,
    awayWinPct,
    over25Pct: (over25 / total) * 100,
    bttsPct: (btts / total) * 100,
    verdict,
    mostLikelyScore,
  })

  return {
    expectedGoalsHome: Number(expectedGoalsHome.toFixed(2)),
    expectedGoalsAway: Number(expectedGoalsAway.toFixed(2)),
    homeWinPct: Math.round(homeWinPct),
    drawPct: Math.round(drawPct),
    awayWinPct: Math.round(awayWinPct),
    mostLikelyScore,
    topScores: topScores.map((s) => ({ ...s, probability: Number((s.probability * 100).toFixed(1)) })),
    over25Pct: Math.round((over25 / total) * 100),
    bttsPct: Math.round((btts / total) * 100),
    confidence,
    verdict,
    report,
  }
}

interface ReportCtx {
  expectedGoalsHome: number
  expectedGoalsAway: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
  over25Pct: number
  bttsPct: number
  verdict: "home" | "draw" | "away"
  mostLikelyScore: { home: number; away: number }
}

function buildReport(homeForm: TeamForm, awayForm: TeamForm, h2h: FormGame[], ctx: ReportCtx): string[] {
  const lines: string[] = []
  const homeName = homeForm.team.name
  const awayName = awayForm.team.name

  // Form assessment
  const homeFormPts = homeForm.formString
  const awayFormPts = awayForm.formString
  lines.push(
    `Son maçlara bakıldığında ${homeName} evinde maç başına ortalama ${homeForm.homeAvgScored.toFixed(
      1,
    )} gol atarken ${homeForm.homeAvgConceded.toFixed(1)} gol yiyor. Genel form çizgisi: ${
      homeFormPts || "veri yok"
    }.`,
  )
  lines.push(
    `${awayName} ise deplasmanda ortalama ${awayForm.awayAvgScored.toFixed(1)} gol üretip ${awayForm.awayAvgConceded.toFixed(
      1,
    )} gol yiyor. Genel form çizgisi: ${awayFormPts || "veri yok"}.`,
  )

  // Tactical read
  if (ctx.expectedGoalsHome - ctx.expectedGoalsAway > 0.6) {
    lines.push(
      `Beklenen gol modelim ${homeName} lehine net bir üstünlük gösteriyor (${ctx.expectedGoalsHome.toFixed(
        2,
      )} - ${ctx.expectedGoalsAway.toFixed(
        2,
      )}). Ev sahibinin oyunu rakip yarı sahaya taşıyıp yüksek tempoyla baskı kurmasını beklerim.`,
    )
  } else if (ctx.expectedGoalsAway - ctx.expectedGoalsHome > 0.6) {
    lines.push(
      `Beklenen gol modelim deplasman ekibini öne çıkarıyor (${ctx.expectedGoalsHome.toFixed(
        2,
      )} - ${ctx.expectedGoalsAway.toFixed(
        2,
      )}). ${awayName} kontrataklarda etkili olabilir; ev sahibinin savunma geçiş anlarına dikkat etmesi gerekir.`,
    )
  } else {
    lines.push(
      `Beklenen gol değerleri birbirine çok yakın (${ctx.expectedGoalsHome.toFixed(2)} - ${ctx.expectedGoalsAway.toFixed(
        2,
      )}). Orta saha mücadelesinin ve duran topların maçın kaderini belirleyeceği dengeli bir karşılaşma öngörüyorum.`,
    )
  }

  // Goals market
  if (ctx.over25Pct >= 55) {
    lines.push(
      `Her iki takımın da hücum verileri gol beklentisini yükseltiyor; 2.5 üst ihtimali %${ctx.over25Pct} seviyesinde. Bol gollü bir maç muhtemel.`,
    )
  } else if (ctx.over25Pct <= 42) {
    lines.push(
      `Savunma disiplinleri ön planda; 2.5 alt daha olası (üst ihtimali yalnızca %${ctx.over25Pct}). Az gollü, temkinli bir oyun bekleniyor.`,
    )
  } else {
    lines.push(`Gol sayısı dengeli görünüyor; 2.5 üst ihtimali %${ctx.over25Pct}, KG Var ihtimali %${ctx.bttsPct}.`)
  }

  // H2H
  if (h2h.length > 0) {
    const homeWins = h2h.filter((g) => g.result === "W").length
    const draws = h2h.filter((g) => g.result === "D").length
    const awayWins = h2h.filter((g) => g.result === "L").length
    lines.push(
      `Son ${h2h.length} karşılaşmada ${homeName} ${homeWins}, ${awayName} ${awayWins} galibiyet aldı, ${draws} maç berabere bitti. Bu geçmiş, ${
        homeWins > awayWins ? homeName : awayWins > homeWins ? awayName : "iki takımın da"
      } psikolojik üstünlüğüne işaret ediyor.`,
    )
  }

  // Verdict
  const verdictName = ctx.verdict === "home" ? homeName : ctx.verdict === "away" ? awayName : "beraberlik"
  lines.push(
    `Teknik değerlendirmem: en olası sonuç ${ctx.mostLikelyScore.home}-${ctx.mostLikelyScore.away}, öne çıkan tahmin ${
      ctx.verdict === "draw" ? "beraberlik" : `${verdictName} galibiyeti`
    }. Yine de futbolun sürprizlere açık olduğunu unutmayın.`,
  )

  return lines
}
