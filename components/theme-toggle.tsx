"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { useLanguage } from "@/contexts/language-context"

export function ThemeToggle() {
  const { t } = useLanguage()
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-primary/50 hover:text-primary"
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.light") : t("theme.dark")}
    >
      {mounted && dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  )
}
