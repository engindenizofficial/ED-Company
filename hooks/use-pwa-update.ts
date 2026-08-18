"use client"

import { useEffect, useRef } from "react"

/**
 * Android'de "Ana ekrana ekle" ile kurulan PWA'lar ayrı bir sekme/işlem gibi
 * uzun süre arka planda canlı tutulur. Kullanıcı uygulama simgesine her
 * bastığında Chrome genelde YENİ bir ağ isteği atmaz, arka planda duran eski
 * sayfayı öne getirir — bu yüzden yeni bir deploy yapılsa bile açık kalan PWA
 * eski JS bundle'ını çalıştırmaya devam eder ("silip yeniden yüklemek" bu
 * yüzden gerekiyordu).
 *
 * Bu hook, sayfa görünür hale geldiğinde (uygulama öne geldiğinde) sunucudaki
 * güncel build kimliğini sorup sayfanın kendi build kimliğiyle karşılaştırır.
 * Farklıysa yeni bir deploy yapılmış demektir ve sayfa otomatik olarak sert
 * biçimde yenilenir (`window.location.reload()`), böylece kullanıcı elle
 * uygulamayı silip tekrar kurmak zorunda kalmaz.
 */
export function usePwaUpdate() {
  const currentBuildIdRef = useRef<string | null>(null)
  const checkingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function fetchBuildId() {
      try {
        const res = await fetch("/api/build-info", { cache: "no-store" })
        if (!res.ok) return null
        const data = await res.json()
        return typeof data.buildId === "string" ? data.buildId : null
      } catch {
        return null
      }
    }

    async function init() {
      const buildId = await fetchBuildId()
      if (!cancelled && buildId) {
        currentBuildIdRef.current = buildId
      }
    }

    async function checkForUpdate() {
      if (checkingRef.current) return
      checkingRef.current = true
      try {
        const latest = await fetchBuildId()
        if (!latest) return
        if (currentBuildIdRef.current && latest !== currentBuildIdRef.current) {
          window.location.reload()
          return
        }
        currentBuildIdRef.current = latest
      } finally {
        checkingRef.current = false
      }
    }

    init()

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", checkForUpdate)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", checkForUpdate)
    }
  }, [])
}
