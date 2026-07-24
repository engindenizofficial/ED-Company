"use client"

import { Clock, LoaderCircle, TrendingUp } from "lucide-react"
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

function statusLabel(short: string): string {
  switch (short) {
    case "FT":   return "MS"
    case "AET":  return "MS (uzatma)"
    case "PEN":  return "MS (pen.)"
    case "HT":   return "İY"
    case "1H":   return "1. Yarı"
    case "2H":   return "2. Yarı"
    case "ET":   return "Uzatma"
    case "BT":   return "Devre arası"
    case "P":    return "Penaltılar"
    case "SUSP": return "Durduruldu"
    case "INT":  return "Ara verildi"
    case "PST":  return "Ertelendi"
    case "CANC": return "İptal"
    case "ABD":  return "Tatil edildi"
    case "TBD":  return "Belirsiz"
    case "NS":   return "Başlamadı"
    default:     return short
  }
}

function liveText(f: FixtureWithPrediction): string {
  if (f.statusShort === "HT") return "İY"
  if (f.statusShort === "BT") return "Devre arası"
  if (f.statusShort === "P") return "Penaltılar"
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
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          {/* League header */}
          <div className="flex items-center gap-2 px-1">
            {group.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" />
            ) : null}
            <Link
              href={`/league/${group.id}`}
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
            >
              {group.name}
              <span className="ml-1.5 font-normal tracking-normal text-muted-foreground/60">{group.country}</span>
            </Link>
          </div>

          {/* Match cards */}
          <ul className="flex flex-col gap-2">
            {group.items.map((f) => {
              const active = f.id === selectedId
              const live = isLive(f.statusShort)
              const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
              const pending = pendingIds.has(f.id)
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    aria-pressed={active}
                    className={cn(
                      "group w-full rounded-xl text-left transition-all duration-200",
                      active
                        ? "ring-inset"
                        : "",
                    )}
                    style={{
                      boxShadow: active
                        ? "var(--shadow-card-active)"
                        : "var(--shadow-card)",
                      background: active
                        ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                        : "var(--card)",
                      border: active
                        ? "1px solid color-mix(in oklch, var(--primary) 40%, var(--border))"
                        : "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 transition-all duration-200"
                      onMouseEnter={(e) => {
                        if (!active) {
                          const el = e.currentTarget.parentElement as HTMLElement
                          el.style.boxShadow = "var(--shadow-card-hover)"
                          el.style.transform = "translateY(-1px)"
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          const el = e.currentTarget.parentElement as HTMLElement
                          el.style.boxShadow = "var(--shadow-card)"
                          el.style.transform = "translateY(0)"
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <TeamRow id={f.home.id} name={f.home.name} logo={f.home.logo} goals={f.goalsHome} played={played} />
                        <TeamRow id={f.away.id} name={f.away.name} logo={f.away.logo} goals={f.goalsAway} played={played} />
                      </div>

                      {/* Gemini prediction chip */}
                      <PredictionChip fixture={f} pending={pending} />

                      {/* Time / status */}
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {kickoff(f.date)}
                        </span>
                        {live ? (
                          <span
                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums text-white"
                            style={{ background: "var(--live)", boxShadow: "var(--glow-live)" }}
                          >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                            {liveText(f)}
                          </span>
                        ) : played ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {statusLabel(f.statusShort)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Analyse CTA — shown when not selected */}
                    {!active && (
                      <div className="flex items-center justify-center gap-1 border-t border-border/50 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 transition-colors group-hover:text-primary/70">
                        <TrendingUp className="h-3 w-3" />
                        Analiz Et
                      </div>
                    )}
                  </button>

                  {/* Expanded analysis panel */}
                  {active ? (
                    <div
                      className="animate-in fade-in slide-in-from-top-2 duration-300 mt-2 rounded-xl p-4"
                      style={{
                        boxShadow: "var(--shadow-card-active)",
                        background: "var(--surface)",
                        border: "1px solid color-mix(in oklch, var(--primary) 25%, var(--border))",
                      }}
                    >
                      {renderExpanded(f)}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The Gemini score prediction shown directly on the card. */
function PredictionChip({ fixture, pending }: { fixture: FixtureWithPrediction; pending: boolean }) {
  const score = fixture.predictedScore

  if (score) {
    return (
      <div
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5"
        style={{
          background: "color-mix(in oklch, var(--primary) 10%, var(--card))",
          border: "1px solid color-mix(in oklch, var(--primary) 30%, var(--border))",
          boxShadow: "var(--glow-primary)",
        }}
        title="Gemini skor tahmini"
      >
        <div className="flex items-center gap-1 text-sm font-extrabold tabular-nums text-foreground">
          <GeminiLogo className="h-3 w-3" />
          <span>
            {score.home}-{score.away}
          </span>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70">Tahmin</span>
      </div>
    )
  }

  if (pending) {
    return (
      <div
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5"
      >
        <div className="flex items-center gap-1 text-muted-foreground">
          <GeminiLogo className="h-3 w-3" />
          <LoaderCircle className="h-3 w-3 animate-spin" />
        </div>
        <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Tahmin</span>
      </div>
    )
  }

  return null
}

function TeamRow({
  id,
  name,
  logo,
  goals,
  played,
}: {
  id: number
  name: string
  logo: string
  goals: number | null
  played: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo || "/placeholder.svg"} alt="" className="h-4 w-4 shrink-0 object-contain" />
      ) : null}
      <Link
        href={`/team/${id}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline"
      >
        {name}
      </Link>
      {played ? (
        <span className="ml-auto text-sm font-extrabold tabular-nums text-foreground">{goals}</span>
      ) : null}
    </div>
  )
}
