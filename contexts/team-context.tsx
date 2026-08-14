"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { TeamBasicInfo, TeamInfo } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"

interface TeamPanelState {
  team: TeamInfo
  // Panel header'ı için hafif özet (isim/logo/stadyum/sezon). Diğer tüm veriler
  // (istatistik, kadro, transferler vb.) sekmelere tıklandığında ayrı ayrı
  // çekilir — bkz. components/team-panel.tsx içindeki useTeamSection hook'u.
  basic: TeamBasicInfo | null
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
  const { t } = useLanguage()

  const openTeam = useCallback(async (team: TeamInfo) => {
    // Start loading immediately
    setPanel({ team, basic: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/team?teamId=${team.id}`, { cache: "no-store" })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const basic: TeamBasicInfo = await res.json()
      setPanel((prev) => (prev?.team.id === team.id ? { team, basic, loading: false, error: null } : prev))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setPanel((prev) => (prev?.team.id === team.id ? { team, basic: null, loading: false, error: msg } : prev))
    }
  }, [t])

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
