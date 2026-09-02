"use client"

import { Building2, CheckCircle2, Gamepad2, Star } from "lucide-react"
import useSWR from "swr"
import { getAccountSummary, type AccountSummary } from "@/app/actions/account"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useLanguage } from "@/contexts/language-context"
import { useSession } from "@/lib/auth-client"

const stats = [
  { key: "favoriteCount", label: "menu.favoriteCount", icon: Star },
  { key: "gamesPlayed", label: "menu.gamesPlayed", icon: Gamepad2 },
  { key: "correctAnswers", label: "menu.correctAnswers", icon: CheckCircle2 },
] as const

export function AccountOverviewCard() {
  const { t } = useLanguage()
  const { data: session } = useSession()
  const { data, error, isLoading } = useSWR<AccountSummary>(
    session?.user ? `account-summary:${session.user.id}` : null,
    getAccountSummary,
    { revalidateOnFocus: false },
  )

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("menu.accountSummary")}</CardTitle>
        <CardDescription>{t("menu.accountSummaryDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p className="text-xs text-destructive" role="alert">{t("menu.summaryLoadError")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {stats.map(({ key, label, icon: Icon }) => (
              <div key={key} className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-secondary px-2.5 py-3">
                <Icon aria-hidden="true" className="text-primary" />
                {isLoading ? <Spinner className="my-0.5" /> : <strong className="text-lg tabular-nums">{data?.[key] ?? 0}</strong>}
                <span className="text-[11px] leading-tight text-muted-foreground">{t(label)}</span>
              </div>
            ))}
          </div>
        )}

        {!error && !isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <Building2 aria-hidden="true" className="shrink-0 text-primary" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-semibold">{t("menu.managerCareer")}</span>
              {data?.career ? (
                <span className="truncate text-xs text-muted-foreground">
                  {data.career.clubName} · {t(data.career.status === "active" ? "menu.careerActive" : "menu.careerBuilding")} · {t("menu.playedMatches", { count: data.career.playedMatches })}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t("menu.noCareer")}</span>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
