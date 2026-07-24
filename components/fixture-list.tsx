"use client"

import { LoaderCircle } from "lucide-react"
import Link from "next/link"
import { GeminiLogo } from "@/components/gemini-logo"
import { cn } from "@/lib/utils"
import type { FixtureWithPrediction } from "@/lib/types"

function kickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP", "HT"])

function isLive(short: string): boolean {
  return LIVE_STATUSES.has(short)
}

function isFinished(short: string): boolean {
  return ["FT", "AET", "PEN"].includes(short)
}

function statusLabel(short: string): string {
  switch (short) {
    case "FT":   return "MS"
    case "AET":  return "MS/U"
    case "PEN":  return "MS/P"
    case "HT":   return "IY"
    case "1H":   return "1Y"
    case "2H":   return "2Y"
    case "ET":   return "UZ"
    case "BT":   return "DA"
    case "P":    return "PEN"
    case "SUSP": return "DUR"
    case "INT":  return "ARA"
    case "PST":  return "ERT"
    case "CANC": return "IPN"
    case "ABD":  return "TAT"
    case "TBD":  return "BLR"
    case "NS":   return ""
    default:     return short
  }
}

function liveText(f: FixtureWithPrediction): string {
  if (f.statusShort === "HT") return "IY"
  if (f.statusShort === "BT") return "DA"
  if (f.statusShort === "P") return "PEN"
  if (typeof f.elapsed === "number") return `${f.elapsed}'`
  return statusLabel(f.statusShort)
}

function groupByLeague(fixtures: FixtureWithPrediction[]) {
  const groups = new Map<
    number,
    { id: number; name: string; country: string; logo: string; items: FixtureWithPrediction[] }
  >()
  for (const f of fixtures) {
    const key = f.league.id
    if (!groups.has(key)) {
      groups.set(key, {
        id: f.league.id,
        name: f.league.name,
        country: f.league.country,
        logo: f.league.logo,
        items: [],
      })
    }
    groups.get(key)!.items.push(f)
  }
  return Array.from(groups.values())
}

export function FixtureList({
  fixtures,
  selectedId,
  pendingIds,
  onSelect,
  renderExpanded,
}: {
  fixtures: FixtureWithPrediction[]
  selectedId: number | null
  pendingIds: Set<number>
  onSelect: (f: FixtureWithPrediction) => void
  renderExpanded: (f: FixtureWithPrediction) => React.ReactNode
}) {
  const groups = groupByLeague(fixtures)

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div
          key={group.id}
          className="overflow-hidden rounded-md border border-border bg-card"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {/* League header — Mackolik style: navy background */}
          <Link
            href={`/league/${group.id}`}
            className="flex items-center gap-2.5 px-3 py-2 transition-opacity hover:opacity-80"
            style={{ background: "var(--navy)" }}
          >
            {group.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.logo} alt="" className="h-4 w-4 object-contain" />
            ) : null}
            <span className="text-xs font-bold text-white">{group.name}</span>
            <span className="text-xs font-normal text-white/60">{group.country}</span>
            <span className="ml-auto text-[10px] font-medium text-white/50">
              {group.items.length} maç
            </span>
          </Link>

          {/* Match rows */}
          <div className="divide-y divide-border">
            {group.items.map((f) => {
              const active = f.id === selectedId
              const live = isLive(f.statusShort)
              const finished = isFinished(f.statusShort)
              const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
              const pending = pendingIds.has(f.id)

              return (
                <div key={f.id}>
                  {/* Match row — Mackolik table style */}
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    aria-pressed={active}
                    className={cn(
                      "group w-full text-left transition-colors",
                      active
                        ? "bg-orange-50 dark:bg-orange-950/20"
                        : "hover:bg-secondary/60",
                    )}
                    style={active ? { borderLeft: "3px solid var(--orange)" } : { borderLeft: "3px solid transparent" }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">

                      {/* Time / Status column */}
                      <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                        {live ? (
                          <>
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums"
                              style={{ background: "var(--live)" }}
                            >
                              {liveText(f)}
                            </span>
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--live)" }} />
                          </>
                        ) : finished ? (
                          <>
                            <span className="text-[10px] font-bold text-muted-foreground">MS</span>
                            <span className="text-[10px] text-muted-foreground/60">{kickoff(f.date)}</span>
                          </>
                        ) : (
                          <span className="text-sm font-bold tabular-nums text-foreground">{kickoff(f.date)}</span>
                        )}
                      </div>

                      {/* Teams + Score — Mackolik centered layout */}
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        {/* Home team */}
                        <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
                          <Link
                            href={`/team/${f.home.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-sm font-semibold text-foreground hover:text-orange-500 transition-colors"
                          >
                            {f.home.name}
                          </Link>
                          {f.home.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
                          ) : null}
                        </div>

                        {/* Score / VS */}
                        <div className="flex shrink-0 items-center gap-1">
                          {played ? (
                            <div
                              className="flex items-center gap-1 rounded px-2.5 py-1 text-sm font-black tabular-nums text-white"
                              style={{
                                background: active ? "var(--orange)" : finished ? "#3a4a5c" : "var(--navy)",
                                minWidth: "3.5rem",
                                justifyContent: "center",
                              }}
                            >
                              <span>{f.goalsHome}</span>
                              <span className="opacity-60">-</span>
                              <span>{f.goalsAway}</span>
                            </div>
                          ) : (
                            <span
                              className="px-2 text-sm font-bold text-muted-foreground"
                            >
                              -
                            </span>
                          )}
                        </div>

                        {/* Away team */}
                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                          {f.away.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
                          ) : null}
                          <Link
                            href={`/team/${f.away.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-sm font-semibold text-foreground hover:text-orange-500 transition-colors"
                          >
                            {f.away.name}
                          </Link>
                        </div>
                      </div>

                      {/* Right: AI prediction chip */}
                      <div className="flex w-14 shrink-0 items-center justify-center">
                        <PredictionChip fixture={f} pending={pending} />
                      </div>

                      {/* Analyse indicator */}
                      <div
                        className={cn(
                          "flex w-16 shrink-0 items-center justify-center rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
                          active
                            ? "text-white"
                            : "text-muted-foreground/60 group-hover:text-orange-500"
                        )}
                        style={active ? { background: "var(--orange)" } : {}}
                      >
                        {active ? "Kapat" : "Analiz"}
                      </div>
                    </div>
                  </button>

                  {/* Expanded analysis panel */}
                  {active && (
                    <div
                      className="border-t border-border px-4 py-4"
                      style={{ background: "var(--surface)" }}
                    >
                      {renderExpanded(f)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function PredictionChip({ fixture, pending }: { fixture: FixtureWithPrediction; pending: boolean }) {
  const score = fixture.predictedScore

  if (score) {
    return (
      <div
        className="flex flex-col items-center gap-0 rounded px-1.5 py-1"
        style={{
          background: "color-mix(in srgb, var(--orange) 12%, var(--card))",
          border: "1px solid color-mix(in srgb, var(--orange) 30%, var(--border))",
        }}
        title="Gemini skor tahmini"
      >
        <div className="flex items-center gap-0.5 text-xs font-black tabular-nums" style={{ color: "var(--orange)" }}>
          <GeminiLogo className="h-2.5 w-2.5" />
          <span>{score.home}-{score.away}</span>
        </div>
        <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">AI</span>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <GeminiLogo className="h-3 w-3" />
        <LoaderCircle className="h-3 w-3 animate-spin" />
      </div>
    )
  }

  return null
}
