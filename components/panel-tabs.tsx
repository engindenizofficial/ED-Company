"use client"

import { useRef, type ReactNode, type WheelEvent } from "react"
import { cn } from "@/lib/utils"

export interface PanelTabItem {
  key: string
  label: string
  icon: ReactNode
}

/**
 * Panellerdeki (lig, takım, oyuncu, maç) bölümleri artık dikey akordeon
 * yerine yatay, yan yana sekmeler olarak sunulur. Bu bileşen sadece
 * sekme çubuğunu render eder; içerik seçimi her panelde `active` prop'u
 * ile ilgili Section bileşenine devredilir.
 */
export function PanelTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: PanelTabItem[]
  active: string
  onChange: (key: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Çoğu fare/trackpad varsayılan olarak yalnızca dikey kaydırma üretir.
  // Dikey tekerlek hareketini yatay kaydırmaya çeviriyoruz ki PC'de de
  // gizli kalan sekmelere fare tekerleğiyle ulaşılabilsin.
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
  }

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border/60 px-1 pb-1",
        // Mobilde parmakla kaydırma her zaman çalışır. PC'de fare tekerleği/trackpad
        // ile de kaydırılabilir; gizli scrollbar yerine ince, görünür bir scrollbar
        // gösteriyoruz ki gizlenen sekmelere ulaşılabilsin.
        "touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
        "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{tab.icon}</span>
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
