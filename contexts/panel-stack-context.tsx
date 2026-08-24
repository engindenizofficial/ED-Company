"use client"

import { createContext, useContext, useRef } from "react"

/**
 * Takım/Lig/Oyuncu/Maç panellerinin her biri kendi iç geçmişini bir yığında
 * (stack) tutar — örn. Takım paneli açıkken içinden başka bir Takım paneli
 * açılabilir, `closeTeam` sadece en üsttekini kapatıp bir öncekini geri
 * getirir (bkz. team-context.tsx / player-context.tsx / league-context.tsx /
 * match-context.tsx).
 *
 * Önceki yaklaşım, her panel TÜRÜ (team/player/league/match) için sadece
 * TEK bir z-index yuvası tutuyordu ve "bu tür en son ne zaman öne
 * getirildi" bilgisine göre sıralıyordu. Bu, aynı türden birden fazla
 * örnek farklı türlerle iç içe açıldığında (örn. Takım1 → Oyuncu1 → Takım2
 * → Oyuncu2) yanlış sonuç veriyordu: Oyuncu2 kapatılınca "oyuncu türü"nün
 * kendi iç yığınındaki Oyuncu1'e dönülüyor ama z-index hâlâ "oyuncu türü en
 * üstte" dediği için altında kalan Takım2 görünmüyordu — kullanıcı önce
 * Oyuncu1'i de kapatmak zorunda kalıyordu, oysa doğru sıra Oyuncu2 →
 * Takım2 → Oyuncu1 → Takım1 → Maç olmalıydı.
 *
 * Çözüm: her panel örneği açıldığı anda global, hiç değişmeyen bir sıra
 * numarası (seq) alır ve bu numara panelin durumuyla (state) birlikte
 * saklanır. z-index doğrudan bu sabit numaradan hesaplanır. Böylece bir üst
 * panel kapanıp bir alt panel yeniden görünür olduğunda, o panel kendi
 * orijinal açılış anındaki (dolayısıyla doğru) z-index değerine otomatik
 * olarak geri döner — ekstra "öne getirme" mantığına gerek kalmaz.
 */

const BASE_Z_INDEX = 50

interface PanelStackContextValue {
  /** Her çağrıldığında artan, benzersiz bir açılış sıra numarası döner. */
  nextSeq: () => number
}

const PanelStackContext = createContext<PanelStackContextValue | null>(null)

export function PanelStackProvider({ children }: { children: React.ReactNode }) {
  const counterRef = useRef(0)
  const nextSeq = () => {
    counterRef.current += 1
    return counterRef.current
  }

  return <PanelStackContext.Provider value={{ nextSeq }}>{children}</PanelStackContext.Provider>
}

/**
 * Bir panel örneği açılırken çağrılır; o örneğe kalıcı olarak atanacak,
 * global olarak benzersiz ve artan bir sıra numarası döner.
 */
export function usePanelSeq(): () => number {
  const ctx = useContext(PanelStackContext)
  if (!ctx) throw new Error("usePanelSeq must be used within PanelStackProvider")
  return ctx.nextSeq
}

/** Bir panelin sabit açılış sıra numarasından ekranda göstereceği z-index'i hesaplar. */
export function panelZIndexForSeq(seq: number): number {
  return BASE_Z_INDEX + seq
}
