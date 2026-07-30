"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { PlayerPageData } from "@/lib/types"

export interface PlayerInfo {
  id: number
  name: string
  photo: string | null
}

interface PlayerPanelState {
  player: PlayerInfo
  data: PlayerPageData | null
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

  const openPlayer = useCallback(async (player: PlayerInfo) => {
    setPanel({ player, data: null, loading: true, error: null })

    try {
      const res = await fetch(`/api/player?playerId=${player.id}&t=${Date.now()}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`)
      const data: PlayerPageData = await res.json()
      setPanel((prev) =>
        prev?.player.id === player.id ? { player, data, loading: false, error: null } : prev,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bir hata oluştu"
      setPanel((prev) =>
        prev?.player.id === player.id
          ? { player, data: null, loading: false, error: msg }
          : prev,
      )
    }
  }, [])

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
