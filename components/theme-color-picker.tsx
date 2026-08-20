"use client"

import { Check } from "lucide-react"
import { ACCENT_COLORS } from "@/lib/accent-colors"
import { useThemeColor } from "@/contexts/theme-color-context"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"

export function ThemeColorPicker() {
  const { accentColor, setAccentColor } = useThemeColor()
  const { t } = useLanguage()

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h3 className="text-sm font-bold text-foreground">{t("themeColorPicker.title")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t("themeColorPicker.description")}
      </p>

      <div className="mt-5 grid grid-cols-5 gap-3">
        {ACCENT_COLORS.map((color) => {
          const active = accentColor === color.id
          const colorName = t(`themeColorPicker.colors.${color.id}`)
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => setAccentColor(color.id)}
              aria-pressed={active}
              aria-label={t("themeColorPicker.colorLabel", { color: colorName })}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                  active ? "ring-foreground scale-105" : "ring-transparent group-hover:ring-border",
                )}
                style={{ backgroundColor: color.swatch }}
              >
                {active ? (
                  <Check aria-hidden="true" className="h-4 w-4 text-white mix-blend-difference" strokeWidth={3} />
                ) : null}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
                {colorName}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
