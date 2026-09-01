import type { RosterPlayer, TeamStrength } from "@/lib/games/opponent-roster"

export type MatchEventType = "goal" | "yellow" | "red"
export type MatchSide = "home" | "away"

export interface MatchEvent {
  minute: number
  type: MatchEventType
  side: MatchSide
  playerName: string
}

export interface MatchResult {
  homeGoals: number
  awayGoals: number
  /** Dakikaya göre sıralı. */
  events: MatchEvent[]
}

/** Ligdeki tipik bir takımın maç başına attığı ortalama gol — xG taban değeri. */
const LEAGUE_AVG_GOALS = 1.35
/** Ev sahibi avantajı çarpanı. */
const HOME_ADVANTAGE = 1.12
/** Güç ölçeği (1-99) merkezi — xG oranını bu değere göre normalize eder. */
const POWER_MIDPOINT = 55

/**
 * Poisson(lambda) dağılımından tek bir örnek üretir (Knuth algoritması).
 * lambda çok büyükse (pratikte olmaz, ama güvenlik için) 10 gol ile sınırlanır.
 */
function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L && k < 10)
  return k - 1
}

/** İki takımın gücü arasındaki farktan, bir tarafın beklenen gol sayısını (xG) hesaplar. */
function expectedGoals(attackPower: number, opponentDefensePower: number, isHome: boolean): number {
  const ratio = attackPower / Math.max(1, opponentDefensePower)
  // Güç oranını POWER_MIDPOINT etrafında normalize et; aksi halde 1-99 ölçeğindeki
  // ham oran çok agresif gol sayıları üretebilir.
  const normalizedRatio = Math.pow(ratio, 1.4)
  const xg = LEAGUE_AVG_GOALS * normalizedRatio * (isHome ? HOME_ADVANTAGE : 1)
  return Math.max(0.15, Math.min(5, xg))
}

/** Gol atan/kart gören oyuncuyu, rolüne ve gücüne göre ağırlıklı rastgele seçer. */
function weightedPick(roster: RosterPlayer[], weightFn: (p: RosterPlayer) => number, rng: () => number): RosterPlayer | null {
  const weighted = roster.map((p) => ({ player: p, weight: weightFn(p) })).filter((w) => w.weight > 0)
  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const w of weighted) {
    roll -= w.weight
    if (roll <= 0) return w.player
  }
  return weighted[weighted.length - 1]?.player ?? null
}

function scorerWeight(p: RosterPlayer): number {
  const base = p.power * p.power
  if (["LW", "RW", "CF", "ST"].includes(p.position)) return base * 3
  if (["DM", "CM", "AM", "LM", "RM"].includes(p.position)) return base * 1.4
  if (["LB", "CB", "RB"].includes(p.position)) return base * 0.35
  return 0
}

function cardWeight(p: RosterPlayer): number {
  if (p.position === "GK") return 0.15
  if (["LB", "CB", "RB"].includes(p.position)) return 1.2
  if (["DM", "CM", "AM", "LM", "RM"].includes(p.position)) return 1.1
  return 0.8
}

function randomMinute(rng: () => number): number {
  return Math.max(1, Math.min(90, Math.floor(rng() * 90) + 1))
}

/**
 * Bir maçı, iki takımın önceden hesaplanmış gücü ve kadrosundan saf bir şekilde
 * simüle eder. DB'ye dokunmaz, zorluk çarpanı uygulamaz — güç değerlerine
 * herhangi bir ayarlama (örn. rakip zorluk yüzdesi) çağıran taraf, bu
 * fonksiyona geçirmeden ÖNCE `TeamStrength` üzerinde yapmalıdır.
 */
export function simulateMatch(
  home: TeamStrength,
  away: TeamStrength,
  homeRoster: RosterPlayer[],
  awayRoster: RosterPlayer[],
  rng: () => number = Math.random,
): MatchResult {
  const homeXg = expectedGoals(home.attack, away.defense, true)
  const awayXg = expectedGoals(away.attack, home.defense, false)

  const homeGoals = samplePoisson(homeXg, rng)
  const awayGoals = samplePoisson(awayXg, rng)

  const events: MatchEvent[] = []

  const addGoal = (side: MatchSide, roster: RosterPlayer[]) => {
    const scorer = weightedPick(roster, scorerWeight, rng) ?? weightedPick(roster, () => 1, rng)
    events.push({
      minute: randomMinute(rng),
      type: "goal",
      side,
      playerName: scorer?.name ?? "Bilinmeyen Oyuncu",
    })
  }

  for (let i = 0; i < homeGoals; i++) addGoal("home", homeRoster)
  for (let i = 0; i < awayGoals; i++) addGoal("away", awayRoster)

  // Görsel çeşitlilik için düşük olasılıklı sarı kart olayları (takım başına 0-3 arası).
  const addCards = (side: MatchSide, roster: RosterPlayer[]) => {
    const cardCount = rng() < 0.15 ? 2 : rng() < 0.55 ? 1 : 0
    for (let i = 0; i < cardCount; i++) {
      const player = weightedPick(roster, cardWeight, rng)
      if (!player) continue
      events.push({ minute: randomMinute(rng), type: "yellow", side, playerName: player.name })
    }
  }
  addCards("home", homeRoster)
  addCards("away", awayRoster)

  events.sort((a, b) => a.minute - b.minute)

  return { homeGoals, awayGoals, events }
}

/**
 * Zorluk ayarını (opponentStrengthPercent) SADECE rakip takımın gücüne uygulamak
 * için kullanılan yardımcı — çağıran taraf, kullanıcının maçında rakip
 * `TeamStrength`'ini bu fonksiyondan geçirip `simulateMatch`'e verir.
 */
export function applyDifficultyToStrength(strength: TeamStrength, opponentStrengthPercent: number): TeamStrength {
  const factor = opponentStrengthPercent / 100
  return {
    defense: strength.defense * factor,
    midfield: strength.midfield * factor,
    attack: strength.attack * factor,
    overall: strength.overall * factor,
  }
}
