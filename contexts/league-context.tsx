"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { LeagueBasicInfo } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"
import { usePanelSeq } from "@/contexts/panel-stack-context"

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
  /** Bu panel örneğine açıldığı anda atanan, diğer panel türleriyle
   * karşılaştırılabilir global sıra numarası — doğru z-index için kullanılır.
   * Bkz. contexts/panel-stack-context.tsx. */
  seq: number
}

interface LeagueContextValue {
  panel: LeaguePanelState | null
  openLeague: (league: LeagueInfo) => void
  closeLeague: () => void
  /**
   * Lig paneli türünün açık olduğu TÜM seviyeleri (bir ligin içinden başka
   * bir lige geçilmiş olabilir) tek seferde kapatır. `closeLeague` sadece en
   * üstteki seviyeyi kapatıp altında kalanı ortaya çıkarırken, bu tamamen
   * sıfırlar — bkz. PanelRouteGuard.
   */
  closeAllLeague: () => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  // Bir lig paneli içinden (örn. başka bir lig/kupa linki) başka bir lig
  // paneli açılabiliyor. Tek bir `panel` slotu kullanmak, ikinci lig
  // açıldığında ilkinin verisini tamamen kaybettiriyordu — bu yüzden bir
  // YIĞIN (stack) tutuyoruz: her açılış üste bir girdi ekler, `closeLeague`
  // sadece en üsttekini kaldırır ve altındaki (verisi hâlâ elimizde olan)
  // panel anında geri görünür olur.
  const [stack, setStack] = useState<LeaguePanelState[]>([])
  const { t } = useLanguage()
  const nextSeq = usePanelSeq()
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const openLeague = useCallback(async (league: LeagueInfo) => {
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setStack((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].league.id === league.id) {
        const next: LeaguePanelState = { league, basic: null, loading: true, error: null, seq: prev[prev.length - 1].seq }
        return [...prev.slice(0, -1), next]
      }
      const next: LeaguePanelState = { league, basic: null, loading: true, error: null, seq: nextSeq() }
      return [...prev, next]
    })

    try {
      const res = await fetch(`/api/league?leagueId=${league.id}&request=${Date.now()}-${requestId}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const basic: LeagueBasicInfo = await res.json()
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setStack((prev) => prev.map((entry) => (entry.league.id === league.id ? { league, basic, loading: false, error: null, seq: entry.seq } : entry)))
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setStack((prev) => prev.map((entry) => (entry.league.id === league.id ? { league, basic: null, loading: false, error: msg, seq: entry.seq } : entry)))
    }
  }, [nextSeq, t])

  const closeLeague = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const closeAllLeague = useCallback(() => {
    setStack([])
  }, [])

  const panel = stack.length > 0 ? stack[stack.length - 1] : null

  return (
    <LeagueContext.Provider value={{ panel, openLeague, closeLeague, closeAllLeague }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeaguePanel(): LeagueContextValue {
  const ctx = useContext(LeagueContext)
  if (!ctx) throw new Error("useLeaguePanel must be used within LeagueProvider")
  return ctx
}
