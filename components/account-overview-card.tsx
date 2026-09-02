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
      <CardContent>
        {error ? (
          <p className="text-xs text-destructive" role="alert">{t("menu.summaryLoadError")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.map(({ key, label, icon: Icon }) => (
              <div key={key} className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-secondary px-3 py-3">
                <Icon aria-hidden="true" className="text-primary" />
                {isLoading ? (
                  <Spinner className="my-0.5" />
                ) : (
                  <strong className="text-lg tabular-nums">{data?.[key] ?? 0}</strong>
                )}
                <span className="text-xs leading-tight text-muted-foreground">{t(label)}</span>
              </div>
            ))}

            <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-secondary px-3 py-3">
              <Building2 aria-hidden="true" className="text-primary" />
              {isLoading ? (
                <Spinner className="my-0.5" />
              ) : data?.career ? (
                <strong className="truncate text-sm">{data.career.clubName}</strong>
              ) : (
                <strong className="text-lg tabular-nums">0</strong>
              )}
              <span className="text-xs leading-tight text-muted-foreground">{t("menu.managerCareer")}</span>
              {!isLoading && data?.career ? (
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {t(data.career.status === "active" ? "menu.careerActive" : "menu.careerBuilding")} · {t("menu.playedMatches", { count: data.career.playedMatches })}
                </span>
              ) : !isLoading ? (
                <span className="text-[11px] leading-tight text-muted-foreground">{t("menu.noCareer")}</span>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
