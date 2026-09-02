"use client"

import { useEffect, type ReactNode } from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { useAccountPreferences } from "@/hooks/use-account-preferences"
import { setPreferenceCookie, THEME_COOKIE } from "@/lib/theme-cookies"

function AccountThemeSync() {
  const { preferences, isLoading, isSignedIn } = useAccountPreferences()
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (!isSignedIn || isLoading || !preferences?.exists || preferences.themeMode === theme) return
    setTheme(preferences.themeMode)
    setPreferenceCookie(THEME_COOKIE, preferences.themeMode)
  }, [isLoading, isSignedIn, preferences, setTheme, theme])

  return null
}

export function ThemeModeProvider({
  children,
  initialTheme = "system",
}: {
  children: ReactNode
  initialTheme?: "system" | "light" | "dark"
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={initialTheme}
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      storageKey="theme"
    >
      <AccountThemeSync />
      {children}
    </NextThemesProvider>
  )
}
