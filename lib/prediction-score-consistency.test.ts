import { describe, expect, it } from "vitest"

import {
  alignScoreWithWinner,
  selectConsistentScore,
  winnerFromScore,
} from "./prediction-score-consistency"

describe("prediction score consistency", () => {
  it("derives the winner represented by a score", () => {
    expect(winnerFromScore(2, 1)).toBe("home")
    expect(winnerFromScore(1, 1)).toBe("draw")
    expect(winnerFromScore(0, 2)).toBe("away")
  })

  it("selects only scores compatible with the final winner", () => {
    expect(
      selectConsistentScore(
        [
          { homeScore: 1, awayScore: 2, weight: 3 },
          { homeScore: 2, awayScore: 1, weight: 2 },
          { homeScore: 3, awayScore: 1, weight: 1 },
        ],
        "home",
      ),
    ).toEqual({ homeScore: 2, awayScore: 1 })
  })

  it("keeps a compatible away score", () => {
    expect(
      selectConsistentScore(
        [
          { homeScore: 2, awayScore: 0, weight: 3 },
          { homeScore: 1, awayScore: 2, weight: 2 },
        ],
        "away",
      ),
    ).toEqual({ homeScore: 1, awayScore: 2 })
  })

  it("keeps a compatible draw score", () => {
    expect(
      selectConsistentScore(
        [
          { homeScore: 2, awayScore: 0, weight: 3 },
          { homeScore: 1, awayScore: 1, weight: 2 },
        ],
        "draw",
      ),
    ).toEqual({ homeScore: 1, awayScore: 1 })
  })

  it("aligns the weighted fallback when no model score matches the winner", () => {
    expect(
      selectConsistentScore(
        [
          { homeScore: 0, awayScore: 2, weight: 1 },
          { homeScore: 1, awayScore: 1, weight: 1 },
        ],
        "home",
      ),
    ).toEqual({ homeScore: 3, awayScore: 2 })
  })

  it("repairs rounding that would contradict the selected winner", () => {
    expect(
      selectConsistentScore(
        [
          { homeScore: 1, awayScore: 0, weight: 1 },
          { homeScore: 2, awayScore: 1, weight: 1 },
        ],
        "home",
      ),
    ).toEqual({ homeScore: 2, awayScore: 1 })
  })

  it("makes the minimum non-negative correction for every winner", () => {
    expect(alignScoreWithWinner(1, 2, "home")).toEqual({ homeScore: 3, awayScore: 2 })
    expect(alignScoreWithWinner(2, 1, "away")).toEqual({ homeScore: 2, awayScore: 3 })
    expect(alignScoreWithWinner(1, 3, "draw")).toEqual({ homeScore: 3, awayScore: 3 })
  })
})
