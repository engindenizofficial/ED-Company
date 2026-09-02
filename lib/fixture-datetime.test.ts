import { describe, expect, it } from "vitest"
import {
  FALLBACK_TIME_ZONE,
  formatCalendarDate,
  formatCalendarMonth,
  formatDateTime,
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

  it("formats a timestamp on the visitor's local day", () => {
    const instant = "2026-01-01T00:30:00Z"
    expect(formatDateTime(instant, "en", "America/New_York", { dateStyle: "short" })).toBe("12/31/25")
    expect(formatDateTime(instant, "tr", "Europe/Istanbul", { dateStyle: "short" })).toBe("1.01.2026")
  })

  it("keeps calendar-only dates on the same day in every locale", () => {
    expect(formatCalendarDate("1998-03-02", "en")).toBe("03/02/1998")
    expect(formatCalendarDate("1998-03-02T00:00:00.000Z", "tr")).toBe("02.03.1998")
    expect(formatCalendarMonth("2026-01", "en")).toBe("January 2026")
  })

  it("returns safe values for invalid dates", () => {
    expect(formatDateTime("not-a-date", "tr", "Europe/Istanbul")).toBe("—")
    expect(formatCalendarDate("unknown", "en")).toBe("unknown")
  })

  it("rejects invalid time zones", () => {
    expect(normalizeTimeZone("Mars/Olympus")).toBe(FALLBACK_TIME_ZONE)
  })
})
