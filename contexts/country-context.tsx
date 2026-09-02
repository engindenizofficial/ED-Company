"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  detectCountryFromLanguages,
  detectCountryFromTimeZone,
  normalizeCountryCode,
  type CountryDetectionSource,
} from "@/lib/country-detection"

const STORAGE_KEY = "ed-country"

type CountryContextValue = {
  /** ISO 3166-1 alpha-2 ülke kodu (örn. "TR", "ID") ya da tespit edilemediyse null. */
  countryCode: string | null
  setCountryCode: (code: string | null) => void
}

const CountryContext = createContext<CountryContextValue | null>(null)

/**
 * Sunucudaki Vercel IP ülkesi ilk render'ı doğru sırayla başlatır. IP başlığı
 * olmayan yerel/v0 önizlemelerinde IANA saat dilimi ve geliştirilmiş BCP 47
 * dil çözümlemesi cihazdan bağımsız yedekler olarak devreye girer.
 */
export function CountryProvider({
  children,
  initialCountryCode,
  initialCountrySource,
}: {
  children: ReactNode
  initialCountryCode?: string | null
  initialCountrySource?: CountryDetectionSource | null
}) {
  const normalizedInitialCountry = normalizeCountryCode(initialCountryCode)
  const [countryCode, setCountryCodeState] = useState<string | null>(normalizedInitialCountry)

  useEffect(() => {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const ipCountry = initialCountrySource === "ip" ? normalizedInitialCountry : null
    const timeZoneCountry = detectCountryFromTimeZone(timeZone)
    const languageCountry = detectCountryFromLanguages(languages)

    let storedCountry: string | null = null
    try {
      storedCountry = normalizeCountryCode(localStorage.getItem(STORAGE_KEY))
    } catch {
      // Depolama kapalı olsa da algılama diğer kaynaklarla çalışmaya devam eder.
    }

    // IP coğrafyası en güvenilir kaynaktır. Vercel başlığı bulunmadığında saat
    // dilimi, eski cihazlarda kayıtlı geçerli değer ve son olarak dil kullanılır.
    const detectedCountry = ipCountry
      ?? timeZoneCountry
      ?? storedCountry
      ?? normalizedInitialCountry
      ?? languageCountry

    queueMicrotask(() => setCountryCodeState(detectedCountry))
    try {
      if (detectedCountry) localStorage.setItem(STORAGE_KEY, detectedCountry)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [initialCountrySource, normalizedInitialCountry])

  const setCountryCode = useCallback((code: string | null) => {
    const normalizedCode = normalizeCountryCode(code)
    setCountryCodeState(normalizedCode)
    try {
      if (normalizedCode) localStorage.setItem(STORAGE_KEY, normalizedCode)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(() => ({ countryCode, setCountryCode }), [countryCode, setCountryCode])

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>
}

export function useCountry() {
  const ctx = useContext(CountryContext)
  if (!ctx) {
    throw new Error("useCountry must be used within a CountryProvider")
  }
  return ctx
}
