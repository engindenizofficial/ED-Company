import { describe, expect, it } from "vitest"
import { relativeValueGap, selectDuelPair } from "./duel-pairing"

const candidates = [
  { playerId: 1, valueEur: 100_000_000 },
  { playerId: 2, valueEur: 90_000_000 },
  { playerId: 3, valueEur: 65_000_000 },
  { playerId: 4, valueEur: 30_000_000 },
]

describe("market value duel pairing", () => {
  it("calculates a symmetric relative gap", () => {
    expect(relativeValueGap(100, 80)).toBeCloseTo(0.2)
    expect(relativeValueGap(80, 100)).toBeCloseTo(0.2)
  })

  it("uses a large value gap on easy", () => {
    const pair = selectDuelPair(candidates, "easy")
    expect(pair).not.toBeNull()
    expect(relativeValueGap(pair![0].valueEur, pair![1].valueEur)).toBeGreaterThanOrEqual(0.45)
  })

  it("uses a medium value gap on normal", () => {
    const pair = selectDuelPair(candidates, "normal")
    expect(pair).not.toBeNull()
    const gap = relativeValueGap(pair![0].valueEur, pair![1].valueEur)
    expect(gap).toBeGreaterThanOrEqual(0.18)
    expect(gap).toBeLessThanOrEqual(0.5)
  })

  it("uses a close value gap on hard", () => {
    const pair = selectDuelPair(candidates, "hard")
    expect(pair).not.toBeNull()
    expect(relativeValueGap(pair![0].valueEur, pair![1].valueEur)).toBeLessThanOrEqual(0.18)
  })

  it("never pairs equal values or duplicate players", () => {
    expect(selectDuelPair([
      { playerId: 1, valueEur: 10 },
      { playerId: 1, valueEur: 20 },
      { playerId: 2, valueEur: 20 },
    ], "hard")).toBeNull()
  })
})
