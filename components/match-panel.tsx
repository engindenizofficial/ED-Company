"use client"

import { X } from "lucide-react"
import { useCallback } from "react"

import { AnalysisPanel } from "@/components/analysis-panel"
import { PanelDragHandle } from "@/components/panel-drag-handle"
import { useMatchPanel } from "@/contexts/match-context"
import { usePanelZIndex } from "@/contexts/panel-stack-context"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useCloseOnBackButton } from "@/hooks/use-close-on-back-button"
import { useSwipeToClose } from "@/hooks/use-swipe-to-close"
import { useSession } from "@/lib/auth-client"
import { isAdminEmail } from "@/lib/admin"
import { useLanguage } from "@/contexts/language-context"
import { cn } from "@/lib/utils"
import type { Fixture } from "@/lib/types"

/**
 * Bir maça referans veren her yerde (takım/lig panelindeki maç satırları,
 * H2H listesi vb.) kullanılacak ortak tıklanabilir sarmalayıcı — tıpkı
 * team-panel.tsx'teki TeamButton, player-panel.tsx'teki PlayerButton ve
 * league-panel.tsx'teki LeagueButton gibi. Tam bir `Fixture` nesnesi ya da
 * sadece `{ id }` kabul eder — ikinci durumda MatchContext tek başına çeker.
 */
export function MatchButton({
  fixture,
  children,
  className,
}: {
  fixture: Fixture | { id: number }
  children: React.ReactNode
  className?: string
}) {
  const { openMatch } = useMatchPanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openMatch(fixture)
      }}
      className={cn("cursor-pointer text-left transition-colors hover:text-primary", className)}
    >
      {children}
    </button>
  )
}

/**
 * Diğer üç panelin (Takım/Oyuncu/Lig) aksine, maç paneli önceden global bir
 * context'te değil — sadece HomeClient'in local state'inde yaşıyordu. Bu
 * yüzden takım/lig panelinin içinden bir maça (örn. "son maçlar" satırı)
 * tıklamak mümkün değildi. Bu bileşen kök layout'ta render edilir ve
 * MatchContext'teki `panel` state'ine göre kendini açar/kapatır — tıpkı
 * components/team-panel.tsx'teki TeamPanel gibi.
 */
export function MatchPanel() {
  const { panel, closeMatch, triggerPrediction, deletePrediction } = useMatchPanel()
  const { t } = useLanguage()
  const { data: session } = useSession()
  const isAdmin = isAdminEmail(session?.user?.email)
  const zIndex = usePanelZIndex("match", !!panel, panel?.fixture.id)

  useBodyScrollLock(!!panel)
  useCloseOnBackButton(
    !!panel,
    () => {
      closeMatch()
    },
    panel ? `/mac/${panel.fixture.id}` : undefined,
  )

  const closePanel = useCallback(() => closeMatch(), [closeMatch])
  const { style: swipeStyle, handlers: swipeHandlers } = useSwipeToClose(closePanel)

  if (!panel) return null

  const { fixture, prediction, predictionLoading } = panel

  return (
    <div
      className="fixed inset-0 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={`${fixture.home.name} - ${fixture.away.name} ${t("home.matchAnalysis")}`}
      style={{ ...swipeStyle, zIndex }}
    >
      {/* Top bar — aşağı sürüklenerek panel kapatılabilir (mobil) */}
      <div className="flex shrink-0 flex-col border-b border-border bg-card" {...swipeHandlers}>
        <PanelDragHandle />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">
              {fixture.home.name} – {fixture.away.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{fixture.league.name}</p>
          </div>
          <button
            type="button"
            onClick={closePanel}
            aria-label={t("common.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnalysisPanel
          fixture={fixture}
          prediction={prediction}
          predictionLoading={predictionLoading}
          onPredict={triggerPrediction}
          isAdmin={isAdmin}
          onDeletePrediction={deletePrediction}
        />
      </div>
    </div>
  )
}

// placeholder removed below
