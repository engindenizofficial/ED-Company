"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { LeagueBasicInfo } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"

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
  const { t } = useLanguage()
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const openLeague = useCallback(async (league: LeagueInfo) => {
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setPanel({ league, basic: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/league?leagueId=${league.id}&request=${Date.now()}-${requestId}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const basic: LeagueBasicInfo = await res.json()
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setPanel((prev) => (prev?.league.id === league.id ? { league, basic, loading: false, error: null } : prev))
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setPanel((prev) => (prev?.league.id === league.id ? { league, basic: null, loading: false, error: msg } : prev))
    }
  }, [t])

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
