"use client"

import { useEffect } from "react"

/**
 * Tam ekran panel/modal açıkken arka plandaki sayfanın kaydırılmasını (ve
 * bilgisayarda görünen ikinci kaydırma çubuğunu) engeller. Panel kendi içinde
 * "overflow-y-auto" ile kaydırılırken, arkadaki body de kaydırılabilir
 * kaldığı için masaüstünde iki farklı scrollbar görünüyordu. Bu hook, `locked`
 * true olduğu sürece body'nin overflow'unu "hidden" yaparak bunu önler.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight

    // Scrollbar kaybolduğunda oluşan yatay kaymayı (layout shift) önlemek için
    // body genişliği ile document genişliği arasındaki farkı padding olarak ekle.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = "hidden"
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [locked])
}
