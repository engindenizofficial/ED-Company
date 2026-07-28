"use client"

import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Fixture } from "@/lib/types"

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
    case "FT":
      return "MS"
    case "AET":
      return "MS (uzatma)"
    case "PEN":
      return "MS (pen.)"
    case "HT":
      return "İY"
    case "1H":
      return "1. Yarı"
    case "2H":
      return "2. Yarı"
    case "ET":
      return "Uzatma"
    case "BT":
      return "Devre arası"
    case "P":
      return "Penaltılar"
    case "SUSP":
      return "Durduruldu"
    case "INT":
      return "Ara verildi"
    case "PST":
      return "Ertelendi"
    case "CANC":
      return "İptal"
    case "ABD":
      return "Tatil edildi"
    case "TBD":
      return "Belirsiz"
    case "NS":
      return "Başlamadı"
    default:
      return short
  }
}

function liveText(f: Fixture): string {
  if (f.statusShort === "HT") return "İY"
  if (f.statusShort === "BT") return "Devre arası"
  if (f.statusShort === "P") return "Penaltılar"
  if (typeof f.elapsed === "number") return `${f.elapsed}'`
  return statusLabel(f.statusShort)
}

function groupByLeague(fixtures: Fixture[]) {
  const groups = new Map<
    number,
    { id: number; name: string; country: string; logo: string; items: Fixture[] }
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
  onSelect,
  renderExpanded,
}: {
  fixtures: Fixture[]
  selectedId: number | null
  onSelect: (f: Fixture) => void
  renderExpanded: (f: Fixture) => React.ReactNode
}) {
  const groups = groupByLeague(fixtures)

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            {group.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" />
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
              <span className="ml-1.5 font-normal text-muted-foreground/70">{group.country}</span>
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {group.items.map((f) => {
              const active = f.id === selectedId
              const live = isLive(f.statusShort)
              const played = f.statusShort !== "NS" && f.statusShort !== "TBD" && f.statusShort !== "PST"
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    aria-pressed={active}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/40 hover:bg-secondary",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <TeamRow id={f.home.id} name={f.home.name} logo={f.home.logo} goals={f.goalsHome} played={played} />
                        <TeamRow id={f.away.id} name={f.away.name} logo={f.away.logo} goals={f.goalsAway} played={played} />
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {kickoff(f.date)}
                        </span>
                        {live ? (
                          <span className="flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                            {liveText(f)}
                          </span>
                        ) : played ? (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                            {statusLabel(f.statusShort)}
                          </span>
                        ) : null}

                      </div>
                    </div>
                  </button>
                  {active ? (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-1.5 rounded-lg border border-primary/30 bg-card p-4">
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
      <span className="truncate text-sm font-medium text-foreground">
        {name}
      </span>
      {played ? <span className="ml-auto text-sm font-bold tabular-nums text-foreground">{goals}</span> : null}
    </div>
  )
}
