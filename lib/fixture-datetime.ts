export const SERVER_TIME_ZONE = "Europe/Istanbul"
export const FALLBACK_TIME_ZONE = "UTC"

function isValidTimeZone(value: string | null | undefined): value is string {
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

function getDateTimeLocale(locale: string): string {
  return locale === "en" || locale.toLowerCase().startsWith("en-") ? "en-US" : "tr-TR"
}

function toValidDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(
  value: string | number | Date,
  locale: string,
  timeZone = FALLBACK_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" },
): string {
  const date = toValidDate(value)
  if (!date) return "—"
  return new Intl.DateTimeFormat(getDateTimeLocale(locale), {
    ...options,
    timeZone: normalizeTimeZone(timeZone),
  }).format(date)
}

export function formatCalendarDate(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
): string {
  const dateKey = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (!dateKey) return value || "—"
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(getDateTimeLocale(locale), {
    ...options,
    timeZone: "UTC",
  }).format(date)
}

export function formatCalendarMonth(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" },
): string {
  const monthKey = value.match(/^\d{4}-\d{2}/)?.[0]
  if (!monthKey) return value || "—"
  return formatCalendarDate(`${monthKey}-15`, locale, options)
}

export function formatFixtureTime(
  iso: string | number | Date,
  locale: string,
  timeZone = FALLBACK_TIME_ZONE,
): string {
  return formatDateTime(iso, locale, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

export function formatFixtureDate(
  iso: string | number | Date,
  locale: string,
  timeZone = FALLBACK_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "2-digit" },
): string {
  return formatDateTime(iso, locale, timeZone, options)
}
