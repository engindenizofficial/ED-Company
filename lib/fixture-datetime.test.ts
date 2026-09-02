import { describe, expect, it } from "vitest"
import {
  FALLBACK_TIME_ZONE,
  formatFixtureTime,
  getDateKey,
  getRelativeDateKey,
  normalizeTimeZone,
  shiftDateKey,
} from "./fixture-datetime"

describe("fixture datetime", () => {
  it("formats the same kickoff in the visitor time zone", () => {
    const kickoff = "2026-01-15T20:00:00Z"
    expect(formatFixtureTime(kickoff, "tr", "Europe/Istanbul")).toBe("23:00")
    expect(formatFixtureTime(kickoff, "en", "Europe/Berlin")).toBe("21:00")
    expect(formatFixtureTime(kickoff, "en", "Europe/London")).toBe("20:00")
  })

  it("respects daylight saving time", () => {
    const kickoff = "2026-07-15T20:00:00Z"
    expect(formatFixtureTime(kickoff, "en", "Europe/Berlin")).toBe("22:00")
    expect(formatFixtureTime(kickoff, "en", "Europe/London")).toBe("21:00")
  })

  it("assigns an instant to the correct local calendar day", () => {
    const instant = new Date("2026-01-01T00:30:00Z")
    expect(getDateKey(instant, "Europe/Istanbul")).toBe("2026-01-01")
    expect(getDateKey(instant, "America/New_York")).toBe("2025-12-31")
  })

  it("shifts calendar keys safely across month and year boundaries", () => {
    expect(shiftDateKey("2025-12-31", 1)).toBe("2026-01-01")
    expect(getRelativeDateKey(-1, "UTC", new Date("2026-03-01T12:00:00Z"))).toBe("2026-02-28")
  })

  it("rejects invalid time zones", () => {
    expect(normalizeTimeZone("Mars/Olympus")).toBe(FALLBACK_TIME_ZONE)
  })
})
