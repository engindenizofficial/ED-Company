"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useLanguage } from "@/contexts/language-context"
import { useAccountPreferences } from "@/hooks/use-account-preferences"
import { setPreferenceCookie, THEME_COOKIE } from "@/lib/theme-cookies"

export function ThemeToggle() {
  const { t } = useLanguage()
  const { resolvedTheme, setTheme } = useTheme()
  const { isSignedIn, update } = useAccountPreferences()
  const dark = resolvedTheme === "dark"

  function toggle() {
    const next = dark ? "light" : "dark"
    setTheme(next)
    setPreferenceCookie(THEME_COOKIE, next)
    if (isSignedIn) void update({ themeMode: next })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.light") : t("theme.dark")}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}
