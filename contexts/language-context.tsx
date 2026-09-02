"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_LOCALE, type Locale, translate } from "@/lib/i18n/dictionaries"
import { useAccountPreferences } from "@/hooks/use-account-preferences"
import { LOCALE_COOKIE, setPreferenceCookie } from "@/lib/theme-cookies"

const STORAGE_KEY = "ed-lang"

type LanguageContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE
  const languages = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  for (const lang of languages) {
    if (lang?.toLowerCase().startsWith("en")) return "en"
    if (lang?.toLowerCase().startsWith("tr")) return "tr"
  }
  return DEFAULT_LOCALE
}

export function LanguageProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  /** Sunucuda `Accept-Language` başlığından çıkarılan dil; ilk boyamada
   *  istemcinin varsayılan dile dönüp sonra değişmesini (flash) önler. */
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)
  const { preferences, isLoading, isSignedIn, update } = useAccountPreferences()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "tr" || stored === "en") {
        setPreferenceCookie(LOCALE_COOKIE, stored)
        queueMicrotask(() => setLocaleState(stored))
        return
      }
    } catch {
      // ignore
    }
    // Kullanıcı daha önce manuel seçim yapmadıysa tarayıcı dilini kullan.
    // initialLocale zaten sunucuda aynı mantıkla hesaplandığı için burada
    // sadece istemci/sunucu farklılık ihtimaline karşı senkronize ediyoruz.
    queueMicrotask(() => setLocaleState(detectBrowserLocale()))
  }, [])

  useEffect(() => {
    if (!isSignedIn || isLoading || !preferences?.exists || preferences.locale === locale) return
    queueMicrotask(() => setLocaleState(preferences.locale))
    setPreferenceCookie(LOCALE_COOKIE, preferences.locale)
    try {
      localStorage.setItem(STORAGE_KEY, preferences.locale)
    } catch {
      // ignore
    }
  }, [isLoading, isSignedIn, locale, preferences])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    setPreferenceCookie(LOCALE_COOKIE, next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    if (isSignedIn) void update({ locale: next })
  }, [isSignedIn, update])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return ctx
}
