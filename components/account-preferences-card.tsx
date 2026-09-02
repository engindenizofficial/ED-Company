"use client"

import { Bell, BellOff, Languages, MonitorCog, Palette, SlidersHorizontal } from "lucide-react"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useLanguage } from "@/contexts/language-context"
import { useThemeColor } from "@/contexts/theme-color-context"
import { useAccountPreferences } from "@/hooks/use-account-preferences"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { ACCENT_COLORS } from "@/lib/accent-colors"
import type { ThemeMode } from "@/app/actions/account"
import type { Locale } from "@/lib/i18n/dictionaries"
import { setPreferenceCookie, THEME_COOKIE } from "@/lib/theme-cookies"

export function AccountPreferencesCard() {
  const { t, locale, setLocale } = useLanguage()
  const { theme = "system", setTheme } = useTheme()
  const { accentColor, setAccentColor } = useThemeColor()
  const { isLoading, error, update } = useAccountPreferences()
  const notifications = usePushNotifications(true)

  function setThemeMode(value: string | null) {
    if (value !== "system" && value !== "light" && value !== "dark") return
    setTheme(value)
    setPreferenceCookie(THEME_COOKIE, value)
    void update({ themeMode: value as ThemeMode })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" />
          {t("menu.preferences")}
        </CardTitle>
        <CardDescription>{t("menu.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Spinner />
            {t("menu.loadingPreferences")}
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive" role="alert">{t("menu.preferencesLoadError")}</p> : null}

        <FieldGroup>
          <Field orientation="horizontal" className="flex-col items-stretch sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <MonitorCog aria-hidden="true" className="shrink-0 text-primary" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <FieldLabel htmlFor="account-theme-mode">{t("menu.themeMode")}</FieldLabel>
                <FieldDescription>{t("menu.themeModeDescription")}</FieldDescription>
              </div>
            </div>
            <Select value={theme} onValueChange={setThemeMode}>
              <SelectTrigger id="account-theme-mode" className="w-full sm:w-32" aria-label={t("menu.themeMode")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="system">{t("menu.themeSystem")}</SelectItem>
                  <SelectItem value="light">{t("theme.light")}</SelectItem>
                  <SelectItem value="dark">{t("theme.dark")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal" className="flex-col items-stretch sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Palette aria-hidden="true" className="shrink-0 text-primary" />
              <FieldLabel htmlFor="account-accent-color">{t("menu.themeColor")}</FieldLabel>
            </div>
            <Select value={accentColor} onValueChange={(value) => value && setAccentColor(value)}>
              <SelectTrigger id="account-accent-color" className="w-full sm:w-32" aria-label={t("menu.themeColor")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {ACCENT_COLORS.map((color) => (
                    <SelectItem key={color.id} value={color.id}>
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: color.swatch }} />
                      {t(`themeColorPicker.colors.${color.id}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal" className="flex-col items-stretch sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Languages aria-hidden="true" className="shrink-0 text-primary" />
              <FieldLabel htmlFor="account-language">{t("menu.language")}</FieldLabel>
            </div>
            <Select value={locale} onValueChange={(value) => value && setLocale(value as Locale)}>
              <SelectTrigger id="account-language" className="w-full sm:w-32" aria-label={t("menu.language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="tr">{t("language.turkish")}</SelectItem>
                  <SelectItem value="en">{t("language.english")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary px-3 py-3">
          {notifications.status === "enabled" ? (
            <Bell aria-hidden="true" className="shrink-0 text-primary" />
          ) : (
            <BellOff aria-hidden="true" className="shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold">{t("menu.notifications")}</span>
              <Badge variant={notifications.accountEnabled ? "default" : "secondary"}>
                {notifications.accountEnabled ? t("notifications.enabled") : t("notifications.disabled")}
              </Badge>
            </div>
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              {notifications.accountEnabled && notifications.status !== "enabled"
                ? t("menu.enableOnThisDevice")
                : t("menu.notificationSyncDescription")}
            </span>
          </div>
          {notifications.status !== "unsupported" ? (
            <Button
              type="button"
              size="sm"
              variant={notifications.status === "enabled" ? "outline" : "default"}
              onClick={notifications.status === "enabled" ? notifications.disable : notifications.enable}
              disabled={notifications.busy || notifications.status === "loading"}
            >
              {notifications.busy ? <Spinner data-icon="inline-start" /> : null}
              {notifications.status === "enabled" ? t("notifications.disable") : t("notifications.enable")}
            </Button>
          ) : null}
        </div>
        {notifications.status === "unsupported" ? (
          <p className="text-xs text-muted-foreground">{t("notifications.notSupported")}</p>
        ) : null}
        {notifications.error ? (
          <p className="text-xs text-destructive" role="alert">{t(`notifications.${notifications.error}`)}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
