"use client"

import Image from "next/image"
import { useLanguage } from "@/contexts/language-context"
import { cn } from "@/lib/utils"
import type { LeagueTableRow } from "@/app/actions/manager-fixtures"

/**
 * Tam lig tablosu — gerçek takımlar + kullanıcının kulübü, tamamen
 * `manager_fixture` simülasyon sonuçlarından türetilir (bkz.
 * app/actions/manager-fixtures.ts#computeLeagueTableFromFixtures).
 * Sütun etiketleri, sitede zaten var olan `league.*` namespace'inden
 * (gerçek dünya puan durumu ekranlarıyla) paylaşılır.
 */
export function LeagueTable({ rows }: { rows: LeagueTableRow[] }) {
  const { t } = useLanguage()

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 text-center">#</th>
            <th className="px-3 py-2.5">{t("league.team")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.played")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.win")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.draw")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.lose")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.goalsFor")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.goalsAgainst")}</th>
            <th className="px-2 py-2.5 text-center">{t("league.goalDiff")}</th>
            <th className="px-3 py-2.5 text-center">{t("league.points")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const goalDiff = row.goalsFor - row.goalsAgainst
            return (
              <tr
                key={row.teamId ?? "user"}
                className={cn(
                  "border-b border-border/40 last:border-0",
                  row.isUser && "bg-emerald-500/10",
                )}
              >
                <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {row.teamLogo ? (
                      <Image
                        src={row.teamLogo}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 shrink-0 rounded-[3px] bg-white object-contain p-0.5 ring-1 ring-black/10"
                        unoptimized
                      />
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <span className={cn("truncate font-semibold", row.isUser ? "text-emerald-400" : "text-foreground")}>
                      {row.teamName}
                    </span>
                    {row.isUser ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                        {t("managerCareer.yourClubBadge")}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.win}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.draw}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.lose}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.goalsFor}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.goalsAgainst}</td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
                </td>
                <td className="px-3 py-2 text-center text-sm font-bold tabular-nums text-foreground">
                  {row.points}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
