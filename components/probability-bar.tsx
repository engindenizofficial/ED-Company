export function ProbabilityBar({
  homeName,
  awayName,
  homePct,
  drawPct,
  awayPct,
}: {
  homeName: string
  awayName: string
  homePct: number
  drawPct: number
  awayPct: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-muted-foreground/50" style={{ width: `${drawPct}%` }} />
        <div className="h-full bg-accent" style={{ width: `${awayPct}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          <span className="truncate font-medium text-foreground">{homeName}</span>
          <span className="shrink-0 font-bold tabular-nums text-primary">%{homePct}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
          <span className="text-muted-foreground">Beraberlik</span>
          <span className="font-bold tabular-nums text-foreground">%{drawPct}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span className="truncate font-medium text-foreground">{awayName}</span>
          <span className="shrink-0 font-bold tabular-nums text-accent">%{awayPct}</span>
        </div>
      </div>
    </div>
  )
}
