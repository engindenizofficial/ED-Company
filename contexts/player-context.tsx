"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { PlayerProfile } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"

export interface PlayerInfo {
  id: number
  name: string
  photo: string | null
}

interface PlayerPanelState {
  player: PlayerInfo
  // Panel header'ı için hafif özet (isim/foto/yaş/pozisyon/mevcut takım).
  // Diğer tüm veriler (sezon istatistikleri, kariyer özeti, kupalar,
  // transferler, sakatlık geçmişi) sekmelere tıklandığında ayrı ayrı çekilir
  // — bkz. components/player-panel.tsx içindeki usePlayerSection hook'u.
  profile: PlayerProfile | null
  loading: boolean
  error: string | null
}

interface PlayerContextValue {
  panel: PlayerPanelState | null
  openPlayer: (player: PlayerInfo) => void
  closePlayer: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<PlayerPanelState | null>(null)
  const { t } = useLanguage()

  const openPlayer = useCallback(async (player: PlayerInfo) => {
    // Start loading immediately
    setPanel({ player, profile: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/player?playerId=${player.id}`, { cache: "no-store" })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const profile: PlayerProfile = await res.json()
      setPanel((prev) =>
        prev?.player.id === player.id ? { player, profile, loading: false, error: null } : prev,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setPanel((prev) =>
        prev?.player.id === player.id ? { player, profile: null, loading: false, error: msg } : prev,
      )
    }
  }, [t])

  const closePlayer = useCallback(() => {
    setPanel(null)
  }, [])

  return (
    <PlayerContext.Provider value={{ panel, openPlayer, closePlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayerPanel(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayerPanel must be used within PlayerProvider")
  return ctx
}
