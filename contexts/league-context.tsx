"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { LeaguePageData } from "@/lib/types"

export interface LeagueInfo {
  id: number
  name: string
  logo: string
  country: string
  flagUrl: string | null
}

interface LeaguePanelState {
  league: LeagueInfo
  data: LeaguePageData | null
  loading: boolean
  error: string | null
}

interface LeagueContextValue {
  panel: LeaguePanelState | null
  openLeague: (league: LeagueInfo) => void
  closeLeague: () => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<LeaguePanelState | null>(null)

  const openLeague = useCallback(async (league: LeagueInfo) => {
    setPanel({ league, data: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/league?leagueId=${league.id}&t=${Date.now()}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`)
      const data: LeaguePageData = await res.json()
      setPanel((prev) =>
        prev?.league.id === league.id ? { league, data, loading: false, error: null } : prev,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bir hata oluştu"
      setPanel((prev) =>
        prev?.league.id === league.id
          ? { league, data: null, loading: false, error: msg }
          : prev,
      )
    }
  }, [])

  const closeLeague = useCallback(() => {
    setPanel(null)
  }, [])

  return (
    <LeagueContext.Provider value={{ panel, openLeague, closeLeague }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeaguePanel(): LeagueContextValue {
  const ctx = useContext(LeagueContext)
  if (!ctx) throw new Error("useLeaguePanel must be used within LeagueProvider")
  return ctx
}
