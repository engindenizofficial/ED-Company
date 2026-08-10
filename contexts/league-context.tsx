"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { LeagueBasicInfo } from "@/lib/types"

export interface LeagueInfo {
  id: number
  name: string
  logo: string
  country: string
  flagUrl: string | null
}

export interface LeaguePanelState {
  league: LeagueInfo
  // Panel header'ı için hafif özet (isim/logo/ülke/sezon). Diğer tüm veriler
  // (puan durumu, gol krallığı, maçlar vb.) sekmelere tıklandığında ayrı ayrı
  // çekilir — bkz. components/league-panel.tsx içindeki useLeagueSection hook'u.
  basic: LeagueBasicInfo | null
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
    // Start loading immediately
    setPanel({ league, basic: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/league?leagueId=${league.id}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`)
      const basic: LeagueBasicInfo = await res.json()
      setPanel((prev) => (prev?.league.id === league.id ? { league, basic, loading: false, error: null } : prev))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bir hata oluştu"
      setPanel((prev) => (prev?.league.id === league.id ? { league, basic: null, loading: false, error: msg } : prev))
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
