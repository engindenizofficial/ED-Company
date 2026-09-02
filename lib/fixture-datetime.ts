export const SERVER_TIME_ZONE = "Europe/Istanbul"
export const FALLBACK_TIME_ZONE = "UTC"

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function normalizeTimeZone(
  value: string | null | undefined,
  fallback = FALLBACK_TIME_ZONE,
): string {
  return isValidTimeZone(value) ? value : fallback
}

export function getBrowserTimeZone(): string {
  if (typeof Intl === "undefined") return FALLBACK_TIME_ZONE
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
}

export function getDateKey(date: Date = new Date(), timeZone = FALLBACK_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export function getRelativeDateKey(
  offsetDays: number,
  timeZone = FALLBACK_TIME_ZONE,
  date: Date = new Date(),
): string {
  return shiftDateKey(getDateKey(date, timeZone), offsetDays)
}

export function formatFixtureTime(
  iso: string | number | Date,
  locale: string,
  timeZone = FALLBACK_TIME_ZONE,
): string {
  return new Date(iso).toLocaleTimeString(locale === "en" ? "en-GB" : "tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: normalizeTimeZone(timeZone),
  })
}

export function formatFixtureDate(
  iso: string | number | Date,
  locale: string,
  timeZone = FALLBACK_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "2-digit" },
): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
    ...options,
    timeZone: normalizeTimeZone(timeZone),
  })
}
