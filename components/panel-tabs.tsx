"use client"

import type { ReactNode } from "react"
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
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-border/60 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
