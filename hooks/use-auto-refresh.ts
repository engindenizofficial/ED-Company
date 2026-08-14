"use client"

import { useEffect, useRef } from "react"

/**
 * Sitedeki tüm otomatik yenilemelerin (ana fikstür listesi, canlı maç
 * panelindeki skor/dakika, maç olayları / oyuncu performansları / maç
 * istatistikleri sekmeleri) uyduğu 3 ortak kural:
 *
 * 1) `enabled` true olduğunda hemen bir kez çalışır (ör. sayfa/sekme ilk
 *    açıldığında veya panel/sekme aktif hale geldiğinde).
 * 2) Tarayıcı sekmesi görünürken (`document.visibilityState === "visible"`)
 *    her `intervalMs` (varsayılan 30sn) bir tekrar çalışır.
 * 3) Tarayıcı sekmesi arka plana geçip tekrar görünür olduğunda hemen bir kez
 *    daha çalışır ve interval sıfırdan başlar; arka planda hiç istek atılmaz.
 *
 * `callback` her render'da güncel tutulur ama effect'i yeniden tetiklemez —
 * bu sayede `enabled`/`intervalMs` değişmediği sürece interval sıfırlanmaz.
 */
export function useAutoRefresh(callback: () => void, enabled: boolean, intervalMs = 30_000) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    let intervalId: ReturnType<typeof setInterval> | null = null

    const run = () => callbackRef.current()

    const startInterval = () => {
      if (intervalId) return
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          run()
        }
      }, intervalMs)
    }

    const stopInterval = () => {
      if (!intervalId) return
      clearInterval(intervalId)
      intervalId = null
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        run()
        startInterval()
      } else {
        stopInterval()
      }
    }

    // 1) Etkinleştiğinde hemen bir kez çalıştır.
    run()
    startInterval()

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, intervalMs])
}
