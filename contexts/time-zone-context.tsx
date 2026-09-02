"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getBrowserTimeZone, normalizeTimeZone, SERVER_TIME_ZONE } from "@/lib/fixture-datetime"

const TimeZoneContext = createContext(SERVER_TIME_ZONE)

export function TimeZoneProvider({
  children,
  initialTimeZone,
}: {
  children: ReactNode
  initialTimeZone?: string | null
}) {
  const serverTimeZone = normalizeTimeZone(initialTimeZone, SERVER_TIME_ZONE)
  const [timeZone, setTimeZone] = useState(serverTimeZone)

  useEffect(() => {
    const browserTimeZone = getBrowserTimeZone()
    queueMicrotask(() => setTimeZone(browserTimeZone))
  }, [])

  const value = useMemo(() => timeZone, [timeZone])
  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>
}

export function useTimeZone(): string {
  return useContext(TimeZoneContext)
}
