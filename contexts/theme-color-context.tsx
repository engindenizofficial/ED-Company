"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { DEFAULT_ACCENT_COLOR, isValidAccentColor } from "@/lib/accent-colors"
import { ACCENT_COOKIE, setPreferenceCookie } from "@/lib/theme-cookies"
import { useAccountPreferences } from "@/hooks/use-account-preferences"

interface ThemeColorContextValue {
  accentColor: string
  setAccentColor: (id: string) => void
}

const ThemeColorContext = createContext<ThemeColorContextValue | null>(null)

// Seçim, giriş yapmış/yapmamış tüm kullanıcılar için tarayıcıda saklanır —
// sayfa yenilendiğinde veya site kapatılıp açıldığında kaybolmaz.
const STORAGE_KEY = "ed-accent-color"

function applyAccentColor(id: string) {
  if (typeof document === "undefined") return
  if (id === DEFAULT_ACCENT_COLOR) {
    document.documentElement.removeAttribute("data-accent")
  } else {
    document.documentElement.setAttribute("data-accent", id)
  }
}

export function ThemeColorProvider({
  children,
  initialAccentColor,
}: {
  children: React.ReactNode
  // Sunucu (app/layout.tsx) çerezden okuyup ilk render'ı bu değerle yapar.
  // Bu sayede localStorage boş/temizlenmiş olsa bile (örn. PWA'da) doğru
  // renk state'i baştan doğru gelir, "orijinale dönme" hissi oluşmaz.
  initialAccentColor?: string
}) {
  const [accentColor, setAccentColorState] = useState(
    isValidAccentColor(initialAccentColor) ? initialAccentColor : DEFAULT_ACCENT_COLOR,
  )
  const { preferences, isLoading, isSignedIn, update } = useAccountPreferences()

  // localStorage'daki eski tercihi de kontrol edip senkron kalmasını
  // sağlarız (çerezler kapalıyken hâlâ bir yedek olarak çalışsın diye).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isValidAccentColor(stored)) {
        setPreferenceCookie(ACCENT_COOKIE, stored)
        if (stored !== accentColor) {
          queueMicrotask(() => setAccentColorState(stored))
          applyAccentColor(stored)
        }
      }
    } catch {
      // sessizce geç (örn. localStorage kapalı)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isSignedIn || isLoading || !preferences?.exists || !isValidAccentColor(preferences.themeColor)) return

    const accountAccentColor = preferences.themeColor
    queueMicrotask(() => setAccentColorState(accountAccentColor))
    applyAccentColor(accountAccentColor)
    setPreferenceCookie(ACCENT_COOKIE, accountAccentColor)
    try {
      window.localStorage.setItem(STORAGE_KEY, accountAccentColor)
    } catch {
      // sessizce geç
    }
  }, [isLoading, isSignedIn, preferences?.exists, preferences?.themeColor])

  const setAccentColor = useCallback((id: string) => {
    if (!isValidAccentColor(id)) return
    setAccentColorState(id)
    applyAccentColor(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // sessizce geç
    }
    setPreferenceCookie(ACCENT_COOKIE, id)
    if (isSignedIn) void update({ themeColor: id })
  }, [isSignedIn, update])

  return (
    <ThemeColorContext.Provider value={{ accentColor, setAccentColor }}>{children}</ThemeColorContext.Provider>
  )
}

export function useThemeColor(): ThemeColorContextValue {
  const ctx = useContext(ThemeColorContext)
  if (!ctx) throw new Error("useThemeColor must be used within ThemeColorProvider")
  return ctx
}
