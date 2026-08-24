"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

const STORAGE_KEY = "ed-country"

type CountryContextValue = {
  /** ISO 3166-1 alpha-2 ülke kodu (örn. "TR", "ID") ya da tespit edilemediyse null. */
  countryCode: string | null
  setCountryCode: (code: string | null) => void
}

const CountryContext = createContext<CountryContextValue | null>(null)

/**
 * Tarayıcının dil tercihlerinden (örn. "tr-TR", "id-ID", "en-US") bölge
 * alt etiketini çıkararak kullanıcının ülkesini tahmin eder. Uygulamanın
 * arayüz dilinden (sadece tr/en) BAĞIMSIZDIR — burada amaç kullanıcının
 * hangi ülkeden olduğunu tahmin etmek, hangi dili kullandığını değil.
 */
function detectBrowserCountry(): string | null {
  if (typeof navigator === "undefined") return null
  const languages = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  for (const lang of languages) {
    if (!lang) continue
    const region = lang.split("-")[1]
    if (region && region.length === 2 && /^[A-Za-z]{2}$/.test(region)) {
      return region.toUpperCase()
    }
  }
  return null
}

export function CountryProvider({ children }: { children: ReactNode }) {
  const [countryCode, setCountryCodeState] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setCountryCodeState(stored)
        return
      }
    } catch {
      // ignore
    }
    setCountryCodeState(detectBrowserCountry())
  }, [])

  const setCountryCode = useCallback((code: string | null) => {
    setCountryCodeState(code)
    try {
      if (code) localStorage.setItem(STORAGE_KEY, code)
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
