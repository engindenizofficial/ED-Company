"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react"
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Sekme çubuğunun kaydırılabilir olup olmadığını (ve hangi yönde) izleyip
  // kenarlarda ince bir "solma" efekti göstererek gizli kalan sekmelerin
  // varlığını belli ediyoruz. Aksi halde mobilde sekmeler aniden kesiliyormuş
  // gibi görünüp arayüz bozuk hissettiriyor.
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [updateScrollState, tabs.length])

  // Aktif sekme değiştiğinde onu çubuğun ortasına yumuşakça kaydırıyoruz.
  // Böylece tarayıcının varsayılan "odaklanan öğeyi kenara sıkıştırarak
  // göster" davranışı yerine, önceki/sonraki sekmelerin de kısmen
  // görünür kalmasını sağlıyoruz.
  useEffect(() => {
    const el = scrollRef.current
    const tabEl = tabRefs.current[active]
    if (!el || !tabEl) return
    const elRect = el.getBoundingClientRect()
    const tabRect = tabEl.getBoundingClientRect()
    const offset = tabRect.left - elRect.left - elRect.width / 2 + tabRect.width / 2
    el.scrollBy({ left: offset, behavior: "smooth" })
  }, [active])

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
    <div className="relative">
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        onScroll={updateScrollState}
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
              ref={(node) => {
                tabRefs.current[tab.key] = node
              }}
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

      {/* Kaydırılabilir içeriğin kesilmediğini, devamının olduğunu belirten kenar solmaları */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}
