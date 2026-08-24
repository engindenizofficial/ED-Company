"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
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
  /**
   * Oyuncu paneli türünün açık olduğu TÜM seviyeleri (bir oyuncunun içinden
   * başka bir oyuncuya geçilmiş olabilir) tek seferde kapatır. `closePlayer`
   * sadece en üstteki seviyeyi kapatıp altında kalanı ortaya çıkarırken, bu
   * tamamen sıfırlar — bkz. PanelRouteGuard.
   */
  closeAllPlayer: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  // Bir oyuncu paneli içinden (örn. transfer geçmişi, benzer oyuncu vb.)
  // başka bir oyuncu paneli açılabiliyor. Tek bir `panel` slotu kullanmak,
  // ikinci oyuncu açıldığında ilkinin verisini tamamen kaybettiriyordu — bu
  // yüzden bir YIĞIN (stack) tutuyoruz: her açılış üste bir girdi ekler,
  // `closePlayer` sadece en üsttekini kaldırır ve altındaki (verisi hâlâ
  // elimizde olan) panel anında geri görünür olur.
  const [stack, setStack] = useState<PlayerPanelState[]>([])
  const { t } = useLanguage()
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const openPlayer = useCallback(async (player: PlayerInfo) => {
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setStack((prev) => {
      const next: PlayerPanelState = { player, profile: null, loading: true, error: null }
      if (prev.length > 0 && prev[prev.length - 1].player.id === player.id) {
        return [...prev.slice(0, -1), next]
      }
      return [...prev, next]
    })

    try {
      const res = await fetch(`/api/player?playerId=${player.id}`, { cache: "no-store", signal: controller.signal })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const profile: PlayerProfile = await res.json()
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setStack((prev) => prev.map((entry) => (entry.player.id === player.id ? { player, profile, loading: false, error: null } : entry)))
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setStack((prev) => prev.map((entry) => (entry.player.id === player.id ? { player, profile: null, loading: false, error: msg } : entry)))
    }
  }, [t])

  const closePlayer = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const closeAllPlayer = useCallback(() => {
    setStack([])
  }, [])

  const panel = stack.length > 0 ? stack[stack.length - 1] : null

  return (
    <PlayerContext.Provider value={{ panel, openPlayer, closePlayer, closeAllPlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayerPanel(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayerPanel must be used within PlayerProvider")
  return ctx
}
