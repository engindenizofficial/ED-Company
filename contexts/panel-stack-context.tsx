"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

/**
 * Takım/Lig/Oyuncu/Maç panelleri kök layout'ta sabit bir DOM sırasıyla
 * render edilir (bkz. app/layout.tsx: Team, League, Player, Match). Hepsi
 * aynı `z-50` değerini kullandığı için iki panel aynı anda açık olduğunda
 * hangisinin üstte göründüğü *açılış sırasına* değil o sabit DOM sırasına
 * bağlı kalıyordu — örneğin Maç paneli açıkken içinden bir Takım paneline
 * tıklamak, Takım paneli DOM'da daha önce render edildiği için onu Maç
 * panelinin altında saklıyordu; kullanıcı yalnızca Maç panelini kapatınca
 * (X'e basınca) Takım paneli görünür oluyordu.
 *
 * Bu context, panellerin en son açılış sırasını bir yığında (stack) takip
 * eder ve her panele bu sıraya göre artan bir z-index atar — böylece hangi
 * DOM sırasında render edildiğine bakılmaksızın en son açılan panel her
 * zaman en üstte görünür.
 */

export type PanelKey = "team" | "league" | "player" | "match"

const BASE_Z_INDEX = 50

interface PanelStackContextValue {
  stack: PanelKey[]
  bringToFront: (key: PanelKey) => void
  remove: (key: PanelKey) => void
}

const PanelStackContext = createContext<PanelStackContextValue | null>(null)

export function PanelStackProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<PanelKey[]>([])

  const bringToFront = useCallback((key: PanelKey) => {
    setStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev.filter((k) => k !== key), key]))
  }, [])

  const remove = useCallback((key: PanelKey) => {
    setStack((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
  }, [])

  return <PanelStackContext.Provider value={{ stack, bringToFront, remove }}>{children}</PanelStackContext.Provider>
}

/**
 * `isOpen` true olduğunda paneli yığının en üstüne taşır ve diğer açık
 * panellerin üzerinde kalmasını sağlayacak bir z-index döner. `isOpen`
 * false olduğunda paneli yığından çıkarır ki bir dahaki açılışta yeniden en
 * üste gelsin.
 */
export function usePanelZIndex(key: PanelKey, isOpen: boolean): number {
  const ctx = useContext(PanelStackContext)
  if (!ctx) throw new Error("usePanelZIndex must be used within PanelStackProvider")
  const { stack, bringToFront, remove } = ctx

  useEffect(() => {
    if (isOpen) {
      bringToFront(key)
    } else {
      remove(key)
    }
  }, [isOpen, key, bringToFront, remove])

  const index = stack.indexOf(key)
  return BASE_Z_INDEX + (index === -1 ? 0 : index + 1)
}
