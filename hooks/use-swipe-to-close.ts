"use client"

import { useCallback, useRef, useState } from "react"

/** Bu kadar aşağı sürüklenirse (piksel) panel kapanır. */
const CLOSE_THRESHOLD = 90
/** Sürükleme sırasında gösterilecek maksimum kayma — elastik his verir. */
const MAX_TRANSLATE = 220

/**
 * Mobil tam ekran panellerde (maç/takım/oyuncu/lig) başlık çubuğunu aşağı
 * doğru kaydırarak kapatma jesti sağlar. Kasıtlı olarak SADECE başlık
 * çubuğuna (header) bağlanmalıdır — panel içeriğinin (sekmeler, listeler)
 * normal dikey scroll'uyla çakışmaması için. Header genelde kaydırılabilir
 * olmadığından burada dokunma/scroll çatışması riski yoktur.
 *
 * Dönen `translateY` ve `isDragging` değerleri panelin kök elemanına
 * `transform: translateY(...)` olarak uygulanmalı, böylece kullanıcı
 * sürüklerken panel elle birlikte aşağı kayar; eşiği geçmeden bırakırsa
 * panel yerine geri döner, geçerse `onClose` çağrılır.
 */
export function useSwipeToClose(onClose: () => void) {
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
    setIsDragging(true)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    // Yukarı sürüklemeyi yoksay — panel yalnızca aşağı doğru kaçabilir.
    if (delta <= 0) {
      setTranslateY(0)
      return
    }
    // Eşikten sonra sürüklemeyi yavaşlatarak "elastik" bir his veriyoruz.
    const eased = delta < CLOSE_THRESHOLD ? delta : CLOSE_THRESHOLD + (delta - CLOSE_THRESHOLD) * 0.35
    setTranslateY(Math.min(eased, MAX_TRANSLATE))
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    setTranslateY((current) => {
      if (current > CLOSE_THRESHOLD) {
        onClose()
      }
      return 0
    })
    startY.current = null
  }, [onClose])

  const onTouchCancel = useCallback(() => {
    dragging.current = false
    setIsDragging(false)
    setTranslateY(0)
    startY.current = null
  }, [])

  return {
    translateY,
    isDragging,
    /** Panelin kök elemanına uygulanacak stil (transform + geçiş). */
    style: {
      transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
      transition: isDragging ? "none" : "transform 200ms ease-out",
    },
    /** Sadece başlık çubuğuna (header) uygulanacak dokunma olayları. */
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  }
}
