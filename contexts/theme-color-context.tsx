"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { DEFAULT_ACCENT_COLOR, isValidAccentColor } from "@/lib/accent-colors"

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

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const [accentColor, setAccentColorState] = useState(DEFAULT_ACCENT_COLOR)

  // İlk yüklemede kayıtlı seçimi oku. Flaşı önlemek için attribute'un kendisi
  // zaten layout.tsx'teki satır-öncesi script tarafından uygulanmış olur;
  // burada sadece React state'ini o değerle senkronlarız.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isValidAccentColor(stored)) {
        setAccentColorState(stored)
      }
    } catch {
      // sessizce geç (örn. localStorage kapalı)
    }
  }, [])

  const setAccentColor = useCallback((id: string) => {
    if (!isValidAccentColor(id)) return
    setAccentColorState(id)
    applyAccentColor(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // sessizce geç
    }
  }, [])

  return (
    <ThemeColorContext.Provider value={{ accentColor, setAccentColor }}>{children}</ThemeColorContext.Provider>
  )
}

export function useThemeColor(): ThemeColorContextValue {
  const ctx = useContext(ThemeColorContext)
  if (!ctx) throw new Error("useThemeColor must be used within ThemeColorProvider")
  return ctx
}
