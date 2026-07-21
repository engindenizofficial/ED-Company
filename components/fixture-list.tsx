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

function groupByLeague(fixtures: Fixture[]) {
  const groups = new Map<number, { id: number; name: string; country: string; logo: string; items: Fixture[] }>()
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
              <span className="ml-1.5 font-normal text-muted-foreground/70">{group.country}</span>
            </h3>
          </div>
          <ul className="flex flex-col gap-1.5">
            {group.items.map((f) => {
              const active = f.id === selectedId
              const played = f.statusShort !== "NS" && f.statusShort !== "TBD"
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <TeamRow name={f.home.name} logo={f.home.logo} goals={f.goalsHome} played={played} />
                        <TeamRow name={f.away.name} logo={f.away.logo} goals={f.goalsAway} played={played} />
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {kickoff(f.date)}
                        </span>
                        {played ? (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                            {f.statusShort}
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
  name,
  logo,
  goals,
  played,
}: {
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
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
      {played ? <span className="ml-auto text-sm font-bold tabular-nums text-foreground">{goals}</span> : null}
    </div>
  )
}
