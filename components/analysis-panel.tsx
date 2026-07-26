"use client"

import { LoaderCircle } from "lucide-react"
import Link from "next/link"
import { FormBadge } from "@/components/form-badge"
import type { AnalysisResponse, MatchEvent, StatItem, LineupPlayer } from "@/lib/types"

interface Props {
  data: AnalysisResponse | undefined
  isLoading: boolean
  error: Error | undefined
}

export function AnalysisPanel({ data, isLoading, error }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
        Veriler yükleniyor...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-destructive">
        Maç verisi alınamadı.
      </div>
    )
  }

  if (!data) return null

  const { live } = data
  const { events, statistics, lineups, standings, h2h, homeStats, awayStats } = live

  return (
    <div className="flex flex-col gap-6">
      {/* Events */}
      {events.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Olaylar</h3>
          <ul className="flex flex-col gap-1">
            {events.map((ev, i) => (
              <EventRow key={i} event={ev} homeTeam={live.fixture.home.name} />
            ))}
          </ul>
        </section>
      )}

      {/* Statistics */}
      {statistics.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">İstatistikler</h3>
          <div className="flex flex-col gap-1.5">
            {statistics.map((stat, i) => (
              <StatRow key={i} stat={stat} />
            ))}
          </div>
        </section>
      )}

      {/* Lineups */}
      {lineups.length >= 2 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">İlk 11</h3>
          <div className="grid grid-cols-2 gap-4">
            {lineups.map((lineup, i) => (
              <LineupCard key={i} lineup={lineup} />
            ))}
          </div>
        </section>
      )}

      {/* Form */}
      {(homeStats || awayStats) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form</h3>
          <div className="grid grid-cols-2 gap-4">
            {homeStats && (
              <div>
                <p className="mb-1 text-xs font-medium text-foreground">{homeStats.team.name}</p>
                <div className="flex gap-1">
                  {homeStats.recent.map((g, i) => (
                    <FormBadge key={i} result={g.result} />
                  ))}
                </div>
              </div>
            )}
            {awayStats && (
              <div>
                <p className="mb-1 text-xs font-medium text-foreground">{awayStats.team.name}</p>
                <div className="flex gap-1">
                  {awayStats.recent.map((g, i) => (
                    <FormBadge key={i} result={g.result} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* H2H */}
      {h2h.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Son Karşılaşmalar</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {h2h.slice(0, 5).map((g, i) => (
              <li key={i} className="flex items-center justify-between rounded border border-border bg-secondary/50 px-2.5 py-1.5">
                <span className="text-muted-foreground">{g.date}</span>
                <span className="font-medium text-foreground">{g.scored} - {g.conceded}</span>
                <FormBadge result={g.result} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Standings */}
      {standings.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Puan Durumu</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1 pr-2 text-left font-medium">#</th>
                  <th className="py-1 pr-2 text-left font-medium">Takım</th>
                  <th className="py-1 pr-2 text-right font-medium">O</th>
                  <th className="py-1 pr-2 text-right font-medium">G</th>
                  <th className="py-1 pr-2 text-right font-medium">B</th>
                  <th className="py-1 pr-2 text-right font-medium">M</th>
                  <th className="py-1 text-right font-medium">P</th>
                </tr>
              </thead>
              <tbody>
                {standings.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1 pr-2 text-muted-foreground">{row.rank}</td>
                    <td className="py-1 pr-2 font-medium text-foreground">
                      <Link href={`/team/${row.teamId}`} className="hover:text-primary hover:underline">
                        {row.team}
                      </Link>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{row.played}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{row.win}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{row.draw}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{row.lose}</td>
                    <td className="py-1 text-right tabular-nums font-bold text-foreground">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function EventRow({ event, homeTeam }: { event: MatchEvent; homeTeam: string }) {
  const isHome = event.team === homeTeam
  const icon =
    event.type === "Goal" ? "⚽" :
    event.type === "Card" && event.detail?.includes("Yellow") ? "🟨" :
    event.type === "Card" ? "🟥" :
    event.type === "subst" ? "🔄" : "•"

  return (
    <li className={`flex items-center gap-2 text-xs ${isHome ? "" : "flex-row-reverse"}`}>
      <span className="w-8 shrink-0 text-center font-semibold tabular-nums text-muted-foreground">
        {event.minute}&apos;
      </span>
      <span>{icon}</span>
      <span className="truncate text-foreground">{event.player}</span>
      {event.assist && <span className="text-muted-foreground">({event.assist})</span>}
    </li>
  )
}

function StatRow({ stat }: { stat: StatItem }) {
  const homeVal = stat.home ?? 0
  const awayVal = stat.away ?? 0
  const homeNum = typeof homeVal === "string" ? parseFloat(homeVal) || 0 : homeVal
  const awayNum = typeof awayVal === "string" ? parseFloat(awayVal) || 0 : awayVal
  const total = homeNum + awayNum
  const homePct = total > 0 ? (homeNum / total) * 100 : 50

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">{homeVal}</span>
        <span>{stat.type}</span>
        <span className="tabular-nums font-medium text-foreground">{awayVal}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="bg-primary rounded-full" style={{ width: `${homePct}%` }} />
      </div>
    </div>
  )
}

function LineupCard({ lineup }: { lineup: { team: string; formation: string | null; startXI: LineupPlayer[] } }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-foreground">
        {lineup.team}
        {lineup.formation ? <span className="ml-1 text-muted-foreground">{lineup.formation}</span> : null}
      </p>
      <ol className="flex flex-col gap-0.5">
        {lineup.startXI.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{p.number}</span>
            <span className="truncate text-foreground">{p.name}</span>
            {p.pos && <span className="ml-auto shrink-0 text-muted-foreground">{p.pos}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
