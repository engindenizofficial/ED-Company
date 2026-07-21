import type { FormGame, Prediction, ScoreProbability, TeamForm } from "./types"

// League-average goals per team per match (baseline)
const LEAGUE_AVG = 1.35
// Home advantage multiplier applied to home expected goals
const HOME_ADVANTAGE = 1.12
// Number of Monte Carlo match simulations
const SIMULATIONS = 10000
// Hard cap on goals sampled in a single simulated match
const MAX_GOALS = 8

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Knuth's algorithm to draw a single Poisson-distributed random goal count.
 */
function poissonSample(lambda: number): number {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= Math.random()
  } while (p > L)
  return k - 1
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

/**
 * AI heuristic: recent-form momentum weighted toward the latest matches.
 * Returns a value in roughly [-1, 1] where positive means "in-form".
 */
function momentum(form: TeamForm): number {
  const games = form.games ?? []
  if (games.length === 0) return 0
  const recent = games.slice(0, Math.min(5, games.length))
  let weighted = 0
  let wsum = 0
  recent.forEach((g, i) => {
    const w = recent.length - i // most recent game carries the most weight
    const pts = g.result === "W" ? 1 : g.result === "D" ? 0 : -1
    weighted += pts * w
    wsum += w
  })
  return wsum > 0 ? clamp(weighted / wsum, -1, 1) : 0
}

/**
 * AI logic filter: down-weights surreal scorelines that do not fit the
 * match context (e.g. 0-5, 4-4) so the "most likely" score stays realistic.
 */
function plausibilityWeight(h: number, a: number, favoriteEdge: number): number {
  let w = 1
  const total = h + a
  const margin = Math.abs(h - a)
  const strongFavorite = favoriteEdge > 0.4

  // Discourage improbably high-scoring games.
  if (total >= 7) w *= 0.1
  else if (total === 6) w *= 0.3
  else if (total === 5) w *= 0.6

  // Discourage high-scoring draws (3-3, 4-4, ...).
  if (h === a && h >= 3) w *= 0.25

  // Big blowouts only make sense when there is a clear favorite.
  if (margin >= 4) w *= strongFavorite ? 0.45 : 0.12
  else if (margin === 3) w *= strongFavorite ? 0.85 : 0.45

  return w
}

/**
 * Measures how complete the underlying data is (recent games + head-to-head).
 * Feeds directly into the dynamic confidence coefficient.
 */
function dataCompleteness(homeForm: TeamForm, awayForm: TeamForm, h2h: FormGame[]): number {
  const games = Math.min(homeForm.played, awayForm.played)
  const gamesScore = clamp(games / 6, 0, 1) // 6+ recent games => full
  const h2hScore = clamp(h2h.length / 4, 0, 1) // 4+ meetings => full
  return clamp(0.65 * gamesScore + 0.35 * h2hScore, 0, 1)
}

export function buildPrediction(homeForm: TeamForm, awayForm: TeamForm, h2h: FormGame[]): Prediction {
  // Attack / defense strengths relative to league average, using venue-specific data
  const homeAttack = (homeForm.homeAvgScored || homeForm.avgScored || LEAGUE_AVG) / LEAGUE_AVG
  const homeDefense = (homeForm.homeAvgConceded || homeForm.avgConceded || LEAGUE_AVG) / LEAGUE_AVG
  const awayAttack = (awayForm.awayAvgScored || awayForm.avgScored || LEAGUE_AVG) / LEAGUE_AVG
  const awayDefense = (awayForm.awayAvgConceded || awayForm.avgConceded || LEAGUE_AVG) / LEAGUE_AVG

  const h2hAdj = h2hAdjustment(h2h)
  const homeMom = momentum(homeForm)
  const awayMom = momentum(awayForm)

  // Expected goals blend statistical strength with AI heuristics
  // (home pressure, head-to-head history and current form momentum).
  let lambdaHome =
    LEAGUE_AVG * homeAttack * awayDefense * HOME_ADVANTAGE * (1 + h2hAdj * 0.4 + homeMom * 0.12)
  let lambdaAway = LEAGUE_AVG * awayAttack * homeDefense * (1 - h2hAdj * 0.4 + awayMom * 0.12)

  lambdaHome = clamp(lambdaHome, 0.2, 4.2)
  lambdaAway = clamp(lambdaAway, 0.2, 4.2)

  // ---- Monte Carlo simulation: play the match SIMULATIONS times ----
  const scoreCounts = new Map<string, { home: number; away: number; count: number }>()
  let homeWin = 0
  let draw = 0
  let awayWin = 0
  let over25 = 0
  let btts = 0

  for (let i = 0; i < SIMULATIONS; i++) {
    const h = Math.min(poissonSample(lambdaHome), MAX_GOALS)
    const a = Math.min(poissonSample(lambdaAway), MAX_GOALS)

    if (h > a) homeWin++
    else if (h === a) draw++
    else awayWin++
    if (h + a > 2) over25++
    if (h > 0 && a > 0) btts++

    const key = `${h}-${a}`
    const entry = scoreCounts.get(key)
    if (entry) entry.count++
    else scoreCounts.set(key, { home: h, away: a, count: 1 })
  }

  const homeWinPct = (homeWin / SIMULATIONS) * 100
  const drawPct = (draw / SIMULATIONS) * 100
  const awayWinPct = (awayWin / SIMULATIONS) * 100
  const over25Pct = (over25 / SIMULATIONS) * 100
  const bttsPct = (btts / SIMULATIONS) * 100

  const favoriteEdge = Math.abs(homeWin - awayWin) / SIMULATIONS

  // Raw score probabilities from the simulation.
  const rawScores: ScoreProbability[] = Array.from(scoreCounts.values()).map((s) => ({
    home: s.home,
    away: s.away,
    probability: s.count / SIMULATIONS,
  }))

  // Rank by AI-filtered plausibility so surreal scores never surface as the pick.
  const ranked = rawScores
    .map((s) => ({ score: s, weighted: s.probability * plausibilityWeight(s.home, s.away, favoriteEdge) }))
    .sort((a, b) => b.weighted - a.weighted)

  const topScores = ranked.slice(0, 5).map((r) => r.score)
  const mostLikelyScore = { home: topScores[0].home, away: topScores[0].away }

  const verdict: "home" | "draw" | "away" =
    homeWinPct >= drawPct && homeWinPct >= awayWinPct
      ? "home"
      : awayWinPct >= drawPct
        ? "away"
        : "draw"

  // ---- Dynamic confidence coefficient ----
  // Blends outcome dominance with how complete the underlying data is.
  const completeness = dataCompleteness(homeForm, awayForm, h2h)
  const topPct = Math.max(homeWinPct, drawPct, awayWinPct)
  const base = (topPct - 33.3) * 1.4 + topScores[0].probability * 100
  const confidence = clamp(Math.round(base * (0.55 + 0.45 * completeness)), 15, 94)

  const report = buildReport(homeForm, awayForm, h2h, {
    lambdaHome,
    lambdaAway,
    homeWinPct,
    drawPct,
    awayWinPct,
    over25Pct,
    bttsPct,
    verdict,
    mostLikelyScore,
    homeMom,
    awayMom,
    completeness,
    confidence,
  })

  return {
    expectedGoalsHome: Number(lambdaHome.toFixed(2)),
    expectedGoalsAway: Number(lambdaAway.toFixed(2)),
    homeWinPct: Math.round(homeWinPct),
    drawPct: Math.round(drawPct),
    awayWinPct: Math.round(awayWinPct),
    mostLikelyScore,
    topScores: topScores.map((s) => ({ ...s, probability: Number((s.probability * 100).toFixed(1)) })),
    over25Pct: Math.round(over25Pct),
    bttsPct: Math.round(bttsPct),
    confidence,
    verdict,
    report,
  }
}

interface ReportCtx {
  lambdaHome: number
  lambdaAway: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
  over25Pct: number
  bttsPct: number
  verdict: "home" | "draw" | "away"
  mostLikelyScore: { home: number; away: number }
  homeMom: number
  awayMom: number
  completeness: number
  confidence: number
}

function momentumWord(m: number): string {
  if (m > 0.45) return "yükselen bir ivmeyle"
  if (m > 0.1) return "istikrarlı bir formda"
  if (m < -0.45) return "düşen bir grafikle"
  if (m < -0.1) return "dalgalı bir formda"
  return "dengeli bir formda"
}

/**
 * AI Coach / Prompt engine: turns the raw statistical inputs into a
 * reasoned technical scouting report, as if briefed by a head coach.
 */
function buildReport(homeForm: TeamForm, awayForm: TeamForm, h2h: FormGame[], ctx: ReportCtx): string[] {
  const lines: string[] = []
  const homeName = homeForm.team.name
  const awayName = awayForm.team.name

  lines.push(
    `${homeName} evinde maç başına ortalama ${homeForm.homeAvgScored.toFixed(1)} gol atıp ${homeForm.homeAvgConceded.toFixed(
      1,
    )} gol yiyor ve sahaya ${momentumWord(ctx.homeMom)} çıkıyor (form: ${homeForm.formString || "veri yok"}).`,
  )
  lines.push(
    `${awayName} deplasmanda ortalama ${awayForm.awayAvgScored.toFixed(1)} gol üretip ${awayForm.awayAvgConceded.toFixed(
      1,
    )} gol yiyor ve ${momentumWord(ctx.awayMom)} geliyor (form: ${awayForm.formString || "veri yok"}).`,
  )

  // Tactical read derived from the simulated expected goals + pressure.
  if (ctx.lambdaHome - ctx.lambdaAway > 0.6) {
    lines.push(
      `Simülasyonum ${homeName} lehine net üstünlük gösteriyor (beklenen gol ${ctx.lambdaHome.toFixed(
        2,
      )} - ${ctx.lambdaAway.toFixed(
        2,
      )}). Ev sahibi ilk yarıdan itibaren topu rakip sahaya taşıyıp yüksek tempoyla baskı kurabilir; ${awayName} savunmada kompakt kalıp kontratak fırsatlarını kollamalı.`,
    )
  } else if (ctx.lambdaAway - ctx.lambdaHome > 0.6) {
    lines.push(
      `Simülasyonum deplasman ekibini öne çıkarıyor (beklenen gol ${ctx.lambdaHome.toFixed(2)} - ${ctx.lambdaAway.toFixed(
        2,
      )}). ${awayName} kontratak etkinliğiyle skor üretebilir; ${homeName} savunma geçiş anlarında pozisyon vermemeye dikkat etmeli.`,
    )
  } else {
    lines.push(
      `Beklenen gol değerleri birbirine çok yakın (${ctx.lambdaHome.toFixed(2)} - ${ctx.lambdaAway.toFixed(
        2,
      )}). Orta saha mücadelesi ve duran toplar maçın kaderini belirleyebilir; dengeli ve kilitli bir karşılaşma öngörüyorum.`,
    )
  }

  // Goals market read.
  if (ctx.over25Pct >= 55) {
    lines.push(
      `İki takımın hücum verileri gol beklentisini yükseltiyor; 10.000 senaryonun %${Math.round(
        ctx.over25Pct,
      )}'inde 2.5 üst geldi. Bol gollü, karşılıklı gollerin (KG Var %${Math.round(ctx.bttsPct)}) görülebileceği bir maç olası.`,
    )
  } else if (ctx.over25Pct <= 42) {
    lines.push(
      `Savunma disiplinleri ön planda; senaryoların yalnızca %${Math.round(
        ctx.over25Pct,
      )}'inde 2.5 üst çıktı. Az gollü, temkinli bir oyun bekliyorum.`,
    )
  } else {
    lines.push(
      `Gol sayısı dengeli görünüyor; 2.5 üst ihtimali %${Math.round(ctx.over25Pct)}, KG Var ihtimali %${Math.round(
        ctx.bttsPct,
      )}. Maçın açık ya da kapalı geçmesi ilk golün zamanlamasına bağlı.`,
    )
  }

  // Head-to-head history.
  if (h2h.length > 0) {
    const homeWins = h2h.filter((g) => g.result === "W").length
    const draws = h2h.filter((g) => g.result === "D").length
    const awayWins = h2h.filter((g) => g.result === "L").length
    lines.push(
      `Son ${h2h.length} karşılaşmada ${homeName} ${homeWins}, ${awayName} ${awayWins} galibiyet aldı, ${draws} maç berabere bitti. Bu geçmiş ${
        homeWins > awayWins ? homeName : awayWins > homeWins ? awayName : "iki tarafın da"
      } psikolojik üstünlüğüne işaret ediyor.`,
    )
  }

  // Verdict + dynamic confidence rationale.
  const verdictName = ctx.verdict === "home" ? homeName : ctx.verdict === "away" ? awayName : "beraberlik"
  lines.push(
    `Sonuç: en olası skor ${ctx.mostLikelyScore.home}-${ctx.mostLikelyScore.away}, öne çıkan tahmin ${
      ctx.verdict === "draw" ? "beraberlik" : `${verdictName} galibiyeti`
    }.`,
  )
  if (ctx.completeness < 0.5) {
    lines.push(
      `Elimdeki veri seti sınırlı olduğu için (form ve H2H verisi eksik) güven katsayısını %${ctx.confidence} ile ölçülü tuttum. Daha fazla veri güveni artırırdı.`,
    )
  } else {
    lines.push(
      `Veri seti yeterince dolu; modelim bu tahmine %${ctx.confidence} güven atıyor. Yine de futbolun sürprizlere açık olduğunu unutmayın.`,
    )
  }

  return lines
}
