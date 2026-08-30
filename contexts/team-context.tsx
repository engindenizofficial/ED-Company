"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { TeamBasicInfo, TeamInfo } from "@/lib/types"
import { useLanguage } from "@/contexts/language-context"
import { usePanelSeq } from "@/contexts/panel-stack-context"

interface TeamPanelState {
  team: TeamInfo
  // Panel header'ı için hafif özet (isim/logo/stadyum/sezon). Diğer tüm veriler
  // (istatistik, kadro, transferler vb.) sekmelere tıklandığında ayrı ayrı
  // çekilir — bkz. components/team-panel.tsx içindeki useTeamSection hook'u.
  basic: TeamBasicInfo | null
  loading: boolean
  error: string | null
  /** Bu panel örneğine açıldığı anda atanan, diğer panel türleriyle
   * karşılaştırılabilir global sıra numarası — doğru z-index için kullanılır.
   * Bkz. contexts/panel-stack-context.tsx. */
  seq: number
}

interface TeamContextValue {
  panel: TeamPanelState | null
  openTeam: (team: TeamInfo) => void
  closeTeam: () => void
  /**
   * Takım paneli türünün açık olduğu TÜM seviyeleri (örn. bir takımın
   * içinden başka bir takıma, oradan da başka birine geçilmiş olabilir) tek
   * seferde kapatır. `closeTeam` sadece en üstteki seviyeyi kapatıp altında
   * kalanı ortaya çıkarırken, bu tamamen sıfırlar — bkz. PanelRouteGuard'ın
   * gerçek bir sayfa geçişinde tüm panelleri kapatma mantığı.
   */
  closeAllTeam: () => void
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: React.ReactNode }) {
  // Bir takım paneli içinden (örn. rakip takım linki, karşılaştırma vb.)
  // başka bir takım paneli açılabiliyor. Tek bir `panel` slotu kullanmak,
  // ikinci takım açıldığında ilkinin verisini tamamen kaybettiriyordu — bu
  // yüzden bir YIĞIN (stack) tutuyoruz: her açılış üste bir girdi ekler,
  // `closeTeam` sadece en üsttekini kaldırır ve altındaki (verisi hâlâ
  // elimizde olan) panel anında geri görünür olur.
  const [stack, setStack] = useState<TeamPanelState[]>([])
  const { t } = useLanguage()
  const nextSeq = usePanelSeq()
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const openTeam = useCallback(async (team: TeamInfo) => {
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setStack((prev) => {
      // Zaten en üstte aynı takım gösteriliyorsa (örn. aynı linke tekrar
      // tıklanması) yeni bir seviye eklemeye gerek yok, mevcut seq'i koru.
      if (prev.length > 0 && prev[prev.length - 1].team.id === team.id) {
        const next: TeamPanelState = { team, basic: null, loading: true, error: null, seq: prev[prev.length - 1].seq }
        return [...prev.slice(0, -1), next]
      }
      const next: TeamPanelState = { team, basic: null, loading: true, error: null, seq: nextSeq() }
      return [...prev, next]
    })

    try {
      const res = await fetch(`/api/team?teamId=${team.id}&request=${Date.now()}-${requestId}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(t("common.serverErrorWithStatus", { status: res.status }))
      const basic: TeamBasicInfo = await res.json()
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setStack((prev) => prev.map((entry) => (entry.team.id === team.id ? { team, basic, loading: false, error: null, seq: entry.seq } : entry)))
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      const msg = err instanceof Error ? err.message : t("common.unexpectedError")
      setStack((prev) => prev.map((entry) => (entry.team.id === team.id ? { team, basic: null, loading: false, error: msg, seq: entry.seq } : entry)))
    }
  }, [nextSeq, t])

  const closeTeam = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const closeAllTeam = useCallback(() => {
    setStack([])
  }, [])

  const panel = stack.length > 0 ? stack[stack.length - 1] : null

  return (
    <TeamContext.Provider value={{ panel, openTeam, closeTeam, closeAllTeam }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeamPanel(): TeamContextValue {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error("useTeamPanel must be used within TeamProvider")
  return ctx
}
