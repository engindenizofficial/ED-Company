"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/contexts/language-context"
import { THEME_COOKIE, setPreferenceCookie } from "@/lib/theme-cookies"

export function ThemeToggle() {
  const { t } = useLanguage()
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains("dark"))
    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    }
  }, [])

  function toggle() {
    const next = !dark

    // Renklerin ani değil, yumuşak bir geçişle değişmesi için kısa süreliğine
    // evrensel bir transition sınıfı eklenir; animasyon bitince kaldırılır
    // (aksi halde tüm hover/etkileşim animasyonları da bu süreye bağlı kalır).
    const root = document.documentElement
    root.classList.add("theme-transitioning")
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    transitionTimeoutRef.current = setTimeout(() => {
      root.classList.remove("theme-transitioning")
    }, 420)

    setDark(next)
    root.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      // ignore
    }
    // Çereze de yazarız — localStorage'dan daha dayanıklı: PWA'da uygulama
    // yeniden başlatıldığında veya localStorage temizlendiğinde sunucu
    // (app/layout.tsx) yine bu çerezden doğru temayı uygulayabilir.
    setPreferenceCookie(THEME_COOKIE, next ? "dark" : "light")
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-primary/50 hover:text-primary"
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.light") : t("theme.dark")}
    >
      {mounted && dark ? (
        <Sun key="sun" className="theme-icon-pop h-3.5 w-3.5" />
      ) : (
        <Moon key="moon" className="theme-icon-pop h-3.5 w-3.5" />
      )}
    </button>
  )
}
