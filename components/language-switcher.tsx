"use client"

import { useLanguage } from "@/contexts/language-context"
import { cn } from "@/lib/utils"

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage()

  return (
    <div
      className="flex items-center rounded-lg border border-border bg-card p-0.5 text-[11px] font-bold"
      role="group"
      aria-label={t("language.label")}
    >
      <button
        type="button"
        onClick={() => setLocale("tr")}
        aria-pressed={locale === "tr"}
        aria-label={t("language.switchTo", { lang: t("language.turkish") })}
        className={cn(
          "rounded-md px-1.5 py-1 tracking-wide transition-colors",
          locale === "tr" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        TR
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        aria-label={t("language.switchTo", { lang: t("language.english") })}
        className={cn(
          "rounded-md px-1.5 py-1 tracking-wide transition-colors",
          locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
    </div>
  )
}
