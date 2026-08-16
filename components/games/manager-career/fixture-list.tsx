"use client"

import { useMemo } from "react"
import Image from "next/image"
import { useLanguage } from "@/contexts/language-context"
import { cn } from "@/lib/utils"
import type { FixtureSummary } from "@/app/actions/manager-fixtures"

/** Fikstür listesindeki bir taraf: gerçek takım logosu/adı ya da kullanıcının kulübü. */
function TeamCell({ name, logo, isUser, align }: { name: string; logo: string | null; isUser: boolean; align: "left" | "right" }) {
  const { t } = useLanguage()
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      {logo ? (
        <Image src={logo} alt="" width={22} height={22} className="h-5.5 w-5.5 shrink-0 object-contain" unoptimized />
      ) : (
        <span className="h-5.5 w-5.5 shrink-0" />
      )}
      <span className={cn("truncate text-sm font-semibold", isUser ? "text-emerald-400" : "text-foreground")}>
        {name}
        {isUser ? (
          <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 align-middle">
            {t("managerCareer.yourClubBadge")}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** Sezon takvimi — matchday'e göre gruplanmış, oynanmış (skor) ve gelecek (rakip) maçlar. */
export function FixtureList({ fixtures }: { fixtures: FixtureSummary[] }) {
  const { t } = useLanguage()

  const byMatchday = useMemo(() => {
    const groups = new Map<number, FixtureSummary[]>()
    for (const f of fixtures) {
      const list = groups.get(f.matchday) ?? []
      list.push(f)
      groups.set(f.matchday, list)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
  }, [fixtures])

  if (fixtures.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("managerCareer.fixturesEmpty")}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {byMatchday.map(([matchday, rows]) => (
        <div key={matchday} className="rounded-2xl border border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("managerCareer.matchdayLabel", { matchday })}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                rows.every((r) => r.status === "played")
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-400",
              )}
            >
              {rows.every((r) => r.status === "played") ? t("managerCareer.playedStatus") : t("managerCareer.scheduledStatus")}
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {rows.map((f) => (
              <li
                key={f.id}
                className={cn("flex items-center gap-3 px-4 py-2.5", f.isUserMatch && "bg-emerald-500/5")}
              >
                <TeamCell name={f.homeTeamName} logo={f.homeTeamLogo} isUser={f.homeTeamId === null} align="right" />
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  {f.status === "played" ? `${f.homeGoals} - ${f.awayGoals}` : t("managerCareer.vsLabel")}
                </span>
                <TeamCell name={f.awayTeamName} logo={f.awayTeamLogo} isUser={f.awayTeamId === null} align="left" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
