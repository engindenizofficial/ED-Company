"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from "react"
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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return

    event.preventDefault()
    let nextIndex = index
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = tabs.length - 1

    const nextTab = tabs[nextIndex]
    onChange(nextTab.key)
    tabRefs.current[nextTab.key]?.focus()
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        onScroll={updateScrollState}
        className={cn(
          "relative flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-muted p-1.5 shadow-sm",
          // Mobilde parmakla kaydırma her zaman çalışır. PC'de fare tekerleği/trackpad
          // ile de kaydırılabilir; gizli scrollbar yerine ince, görünür bir scrollbar
          // gösteriyoruz ki gizlenen sekmelere ulaşılabilsin.
          "touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
          "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        )}
        role="tablist"
        aria-label="Panel bölümleri"
      >
        {tabs.map((tab, index) => {
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
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-bold outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97]",
                isActive
                  ? "border-primary/40 bg-card text-primary shadow-sm"
                  : "border-border/70 bg-background/60 text-foreground hover:border-primary/30 hover:bg-card",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Kaydırılabilir içeriğin kesilmediğini, devamının olduğunu belirten kenar solmaları */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-px left-px w-8 rounded-l-xl bg-gradient-to-r from-muted to-transparent transition-opacity",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-px right-px w-8 rounded-r-xl bg-gradient-to-l from-muted to-transparent transition-opacity",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}
