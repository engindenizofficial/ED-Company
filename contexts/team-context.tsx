"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { TeamInfo, TeamPageData } from "@/lib/types"

interface TeamPanelState {
  team: TeamInfo
  data: TeamPageData | null
  loading: boolean
  error: string | null
}

interface TeamContextValue {
  panel: TeamPanelState | null
  openTeam: (team: TeamInfo) => void
  closeTeam: () => void
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<TeamPanelState | null>(null)

  const openTeam = useCallback(async (team: TeamInfo) => {
    // Start loading immediately
    setPanel({ team, data: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/team?teamId=${team.id}&t=${Date.now()}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`)
      const data: TeamPageData = await res.json()
      setPanel((prev) => (prev?.team.id === team.id ? { team, data, loading: false, error: null } : prev))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bir hata oluştu"
      setPanel((prev) => (prev?.team.id === team.id ? { team, data: null, loading: false, error: msg } : prev))
    }
  }, [])

  const closeTeam = useCallback(() => {
    setPanel(null)
  }, [])

  return (
    <TeamContext.Provider value={{ panel, openTeam, closeTeam }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeamPanel(): TeamContextValue {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error("useTeamPanel must be used within TeamProvider")
  return ctx
}
