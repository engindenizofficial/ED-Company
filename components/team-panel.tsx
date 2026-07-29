"use client"

import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MapPin,
  Shield,
  ShieldOff,
  Target,
  Users,
  X,
} from "lucide-react"
import { useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { cn } from "@/lib/utils"
import type { Fixture, SquadPlayer, StandingRow, TeamSeasonStats } from "@/lib/types"

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function FormDot({ result }: { result: "W" | "D" | "L" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
        result === "W" && "bg-primary/15 text-primary",
        result === "D" && "bg-secondary text-secondary-foreground",
        result === "L" && "bg-destructive/15 text-destructive",
      )}
    >
      {result}
    </span>
  )
}

function StatBar({
  label,
  value,
  max,
  accent = false,
}: {
  label: string
  value: number
  max: number
  accent?: boolean
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all", accent ? "bg-accent" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  open,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left transition-colors hover:bg-secondary"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {open ? (
        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Season stats section
// ---------------------------------------------------------------------------

function SeasonStatsSection({ stats }: { stats: TeamSeasonStats }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Sezon İstatistikleri"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4">
          {/* Win / Draw / Loss */}
          <div className="col-span-2 flex items-center justify-center gap-4 border-b border-border pb-3">
            {[
              { label: "Galibiyet", value: stats.wins, color: "text-primary" },
              { label: "Beraberlik", value: stats.draws, color: "text-muted-foreground" },
              { label: "Mağlubiyet", value: stats.losses, color: "text-destructive" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className={cn("text-2xl font-extrabold tabular-nums", color)}>{value}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          {/* Bars */}
          <div className="col-span-2 flex flex-col gap-3">
            <StatBar label="Oynanan Maç" value={stats.played} max={38} />
            <StatBar label="Maç başı gol (ort.)" value={parseFloat(stats.goalsForAvg.toFixed(2))} max={3} accent />
            <StatBar label="Yenilen gol (ort.)" value={parseFloat(stats.goalsAgainstAvg.toFixed(2))} max={3} />
            <StatBar label="Gol yemeden geçen" value={stats.cleanSheets} max={stats.played} />
            <StatBar label="Gol atamadığı maç" value={stats.failedToScore} max={stats.played} accent />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form section
// ---------------------------------------------------------------------------

function FormSection({ stats }: { stats: TeamSeasonStats }) {
  const [open, setOpen] = useState(true)
  const recent = stats.recent.slice(0, 6)
  if (recent.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Target className="h-3.5 w-3.5" />}
        title="Son Form"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 pb-2">
            {recent.map((g, i) => (
              <FormDot key={i} result={g.result} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {recent.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FormDot result={g.result} />
                  <span className="truncate text-foreground font-medium">{g.opponent}</span>
                  <span className="shrink-0 text-muted-foreground">{g.home ? "(Ev)" : "(Dep)"}</span>
                </div>
                <span className="ml-2 shrink-0 font-bold tabular-nums text-foreground">
                  {g.scored}–{g.conceded}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent fixtures section
// ---------------------------------------------------------------------------

function kickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

function RecentFixturesSection({ fixtures }: { fixtures: Fixture[] }) {
  const [open, setOpen] = useState(false)
  const finished = fixtures.filter((f) => /FT|AET|PEN/.test(f.statusShort))
  if (finished.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Son Maçlar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {finished.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{f.league.name}</span>
                <div className="flex items-center gap-1 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.home.name}</span>
                  <span className="shrink-0 text-muted-foreground">vs</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.away.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="tabular-nums font-bold text-foreground">
                  {f.goalsHome} – {f.goalsAway}
                </span>
                <span className="text-[10px] text-muted-foreground">{kickoff(f.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Squad section
// ---------------------------------------------------------------------------

const POS_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 }
const POS_LABEL: Record<string, string> = {
  Goalkeeper: "Kaleci",
  Defender: "Defans",
  Midfielder: "Orta Saha",
  Attacker: "Forvet",
}

function SquadSection({ squad }: { squad: SquadPlayer[] }) {
  const [open, setOpen] = useState(false)
  if (squad.length === 0) return null

  const grouped = squad.reduce<Record<string, SquadPlayer[]>>((acc, p) => {
    const pos = p.pos ?? "Other"
    if (!acc[pos]) acc[pos] = []
    acc[pos].push(p)
    return acc
  }, {})

  const positions = Object.keys(grouped).sort(
    (a, b) => (POS_ORDER[a] ?? 99) - (POS_ORDER[b] ?? 99),
  )

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Users className="h-3.5 w-3.5" />}
        title={`Kadro (${squad.length} oyuncu)`}
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {positions.map((pos) => (
            <div key={pos}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {POS_LABEL[pos] ?? pos}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {grouped[pos].map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2"
                  >
                    {p.number != null && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-bold tabular-nums text-secondary-foreground">
                        {p.number}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{p.name}</p>
                      {p.age != null && (
                        <p className="text-[10px] text-muted-foreground">{p.age} yaş</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standings section
// ---------------------------------------------------------------------------

function StandingsSection({
  standings,
  teamId,
}: {
  standings: StandingRow[]
  teamId: number
}) {
  const [open, setOpen] = useState(false)
  if (standings.length === 0) return null

  const groups = standings.reduce<Record<string, StandingRow[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = []
    acc[r.group].push(r)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Shield className="h-3.5 w-3.5" />}
        title="Puan Durumu"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {Object.entries(groups).map(([group, rows]) => (
            <div key={group}>
              {Object.keys(groups).length > 1 && (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {group}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] text-muted-foreground">
                      <th className="pb-1.5 pr-2 font-medium w-6">#</th>
                      <th className="pb-1.5 pr-2 font-medium">Takım</th>
                      <th className="pb-1.5 px-2 font-medium text-center">O</th>
                      <th className="pb-1.5 px-2 font-medium text-center">G</th>
                      <th className="pb-1.5 px-2 font-medium text-center">B</th>
                      <th className="pb-1.5 px-2 font-medium text-center">M</th>
                      <th className="pb-1.5 pl-2 font-medium text-center font-bold">P</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => {
                      const isTeam = r.teamId === teamId
                      return (
                        <tr
                          key={r.rank}
                          className={cn(
                            "transition-colors",
                            isTeam
                              ? "bg-primary/10 font-semibold"
                              : "hover:bg-secondary/50",
                          )}
                        >
                          <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{r.rank}</td>
                          <td className="py-1.5 pr-2">
                            <span className={cn("truncate", isTeam && "text-primary font-semibold")}>
                              {r.team}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-center tabular-nums">{r.played}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums text-primary">{r.win}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums text-destructive">{r.lose}</td>
                          <td className="py-1.5 pl-2 text-center tabular-nums font-bold text-foreground">{r.points}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function TeamPanel() {
  const { panel, closeTeam } = useTeamPanel()

  if (!panel) return null

  const { team, data, loading, error } = panel

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${team.name} takım bilgileri`}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeTeam}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:mx-4 sm:rounded-2xl sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4">
          {team.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logo}
              alt={team.name}
              className="h-10 w-10 object-contain drop-shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-foreground">
              {team.name}
            </h2>
            {data?.venue.name && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {data.venue.name}
                {data.venue.city ? `, ${data.venue.city}` : ""}
                {data.venue.capacity ? ` · ${data.venue.capacity.toLocaleString("tr-TR")} kişilik` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closeTeam}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Season badge */}
        {data && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2">
            <span className="text-xs text-muted-foreground">Sezon</span>
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {data.currentSeason}/{String(data.currentSeason + 1).slice(2)}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Takım verileri yükleniyor...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-destructive/60" />
              <p className="text-sm font-semibold text-destructive">Veri alınamadı</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col gap-4">
              {data.stats && <SeasonStatsSection stats={data.stats} />}
              {data.stats && <FormSection stats={data.stats} />}
              <RecentFixturesSection fixtures={data.recentFixtures} />
              <SquadSection squad={data.squad} />
              <StandingsSection standings={data.standings} teamId={team.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable team name / button — use this anywhere in the app
// ---------------------------------------------------------------------------

export function TeamButton({
  team,
  children,
  className,
}: {
  team: { id: number; name: string; logo: string }
  children: React.ReactNode
  className?: string
}) {
  const { openTeam } = useTeamPanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openTeam(team)
      }}
      className={cn(
        "cursor-pointer rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  )
}
