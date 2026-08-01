"use client"

import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Shield,
  ShieldOff,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"
import { useLeaguePanel } from "@/contexts/league-context"
import { PlayerButton } from "@/components/player-panel"
import { cn } from "@/lib/utils"
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueTopAssist,
  LeagueTopScorer,
  StandingRow,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

function kickoffFull(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "Europe/Istanbul",
  })
}

function matchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  })
}

function SectionHeader({
  icon,
  title,
  open,
  onToggle,
  badge,
}: {
  icon: React.ReactNode
  title: string
  open: boolean
  onToggle: () => void
  badge?: string | number
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
        {badge !== undefined && (
          <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
            {badge}
          </span>
        )}
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
// Season Overview
// ---------------------------------------------------------------------------

function SeasonOverviewSection({ stats }: { stats: LeagueSeasonStats }) {
  const [open, setOpen] = useState(true)
  const items = [
    { label: "Oynanan Maç", value: stats.totalMatches.toLocaleString("tr-TR") },
    { label: "Toplam Gol", value: stats.totalGoals.toLocaleString("tr-TR") },
    { label: "Maç Başı Gol", value: stats.avgGoalsPerMatch.toFixed(2) },
    { label: "Sarı Kart", value: stats.yellowCards.toLocaleString("tr-TR") },
    { label: "Kırmızı Kart", value: stats.redCards.toLocaleString("tr-TR") },
  ]
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Sezon Özeti"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-5">
          {items.map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center gap-0.5 rounded-lg bg-secondary/50 px-2 py-3">
              <span className="text-base font-extrabold tabular-nums text-foreground">{value}</span>
              <span className="text-center text-[10px] leading-tight text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsSection({ standings }: { standings: StandingRow[] }) {
  const [open, setOpen] = useState(true)
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
        badge={standings.length}
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
                    <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                      <th className="w-6 pb-1.5 pr-2 font-medium">#</th>
                      <th className="pb-1.5 pr-2 font-medium">Takım</th>
                      <th className="px-2 pb-1.5 text-center font-medium">O</th>
                      <th className="px-2 pb-1.5 text-center font-medium">G</th>
                      <th className="px-2 pb-1.5 text-center font-medium">B</th>
                      <th className="px-2 pb-1.5 text-center font-medium">M</th>
                      <th className="px-2 pb-1.5 text-center font-medium">AG</th>
                      <th className="pl-2 pb-1.5 text-center font-medium">P</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.rank} className="transition-colors hover:bg-secondary/50">
                        <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{r.rank}</td>
                        <td className="max-w-[100px] truncate py-1.5 pr-2 font-medium text-foreground">
                          {r.team}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{r.played}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-primary">{r.win}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-destructive">{r.lose}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                          {r.goalsFor - r.goalsAgainst > 0 ? "+" : ""}
                          {r.goalsFor - r.goalsAgainst}
                        </td>
                        <td className="pl-2 py-1.5 text-center tabular-nums font-bold text-foreground">
                          {r.points}
                        </td>
                      </tr>
                    ))}
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
// Top Scorers
// ---------------------------------------------------------------------------

function TopScorersSection({ scorers }: { scorers: LeagueTopScorer[] }) {
  const [open, setOpen] = useState(false)
  if (scorers.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Star className="h-3.5 w-3.5" />}
        title="Gol Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${scorers.length}`}
      />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Oyuncu</th>
                  <th className="px-2 pb-2 text-center font-medium">Takım</th>
                  <th className="px-2 pb-2 text-center font-medium">G</th>
                  <th className="px-2 pb-2 text-center font-medium">A</th>
                  <th className="px-2 pb-2 text-center font-medium">M</th>
                  <th className="pl-2 pb-2 text-center font-medium">Ort.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scorers.map((s, i) => (
                  <tr key={s.player.id} className="transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-2 tabular-nums font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <PlayerButton player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }} className="flex items-center gap-2">
                        {s.player.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.player.photo}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground hover:text-primary">{s.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {s.team.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.team.logo} alt={s.team.name} title={s.team.name} className="mx-auto h-5 w-5 object-contain" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{s.team.name}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums font-bold text-primary">{s.goals}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-accent-foreground">{s.assists}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                    <td className="pl-2 py-2 text-center tabular-nums text-muted-foreground">
                      {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Assists
// ---------------------------------------------------------------------------

function TopAssistsSection({ assists }: { assists: LeagueTopAssist[] }) {
  const [open, setOpen] = useState(false)
  if (assists.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Zap className="h-3.5 w-3.5" />}
        title="Asist Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${assists.length}`}
      />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Oyuncu</th>
                  <th className="px-2 pb-2 text-center font-medium">Takım</th>
                  <th className="px-2 pb-2 text-center font-medium">A</th>
                  <th className="px-2 pb-2 text-center font-medium">G</th>
                  <th className="pl-2 pb-2 text-center font-medium">M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assists.map((s, i) => (
                  <tr key={s.player.id} className="transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-2 tabular-nums font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <PlayerButton player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }} className="flex items-center gap-2">
                        {s.player.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.player.photo}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground hover:text-primary">{s.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {s.team.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.team.logo} alt={s.team.name} title={s.team.name} className="mx-auto h-5 w-5 object-contain" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{s.team.name}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums font-bold text-primary">{s.assists}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{s.goals}</td>
                    <td className="pl-2 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent Fixtures
// ---------------------------------------------------------------------------

function RecentFixturesSection({ fixtures }: { fixtures: Fixture[] }) {
  const [open, setOpen] = useState(false)
  if (fixtures.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Son Maçlar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={fixtures.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {fixtures.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{f.league.round} · {kickoff(f.date)}</span>
                <div className="flex items-center gap-1.5 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.home.name}</span>
                  <span className="shrink-0 tabular-nums font-bold text-foreground">
                    {f.goalsHome} – {f.goalsAway}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.away.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upcoming Fixtures
// ---------------------------------------------------------------------------

function UpcomingFixturesSection({ fixtures }: { fixtures: Fixture[] }) {
  const [open, setOpen] = useState(false)
  if (fixtures.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Yaklaşan Maçlar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={fixtures.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {fixtures.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{f.league.round}</span>
                <div className="flex items-center gap-1.5 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.home.name}</span>
                  <span className="shrink-0 text-muted-foreground">–</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.away.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-semibold tabular-nums text-foreground">{matchTime(f.date)}</span>
                <span className="text-[10px] text-muted-foreground">{kickoffFull(f.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function LeaguePanel() {
  const { panel, closeLeague } = useLeaguePanel()
  if (!panel) return null
  const { league, data, loading, error } = panel

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${league.name} lig bilgileri`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeLeague}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl max-h-[90dvh] sm:mx-4 sm:rounded-2xl sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 shrink-0">
          {league.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={league.logo} alt={league.name} className="h-11 w-11 object-contain drop-shadow-sm" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-foreground">{league.name}</h2>
            <div className="flex items-center gap-1.5">
              {league.flagUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={league.flagUrl} alt="" className="h-3 w-4 object-cover rounded-[2px]" />
              )}
              <p className="text-xs text-muted-foreground">{league.country}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLeague}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Season badge */}
        {data && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2 shrink-0">
            <span className="text-xs text-muted-foreground">Sezon</span>
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {data.league.season}/{String(data.league.season + 1).slice(2)}
            </span>
            {data.seasonStats && (
              <>
                <span className="text-border">·</span>
                <span className="text-xs text-muted-foreground">
                  {data.seasonStats.totalMatches} maç · {data.seasonStats.totalGoals} gol
                </span>
              </>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Lig verileri yükleniyor...</p>
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
              {data.seasonStats && <SeasonOverviewSection stats={data.seasonStats} />}
              <StandingsSection standings={data.standings} />
              <TopScorersSection scorers={data.topScorers} />
              <TopAssistsSection assists={data.topAssists} />
              <RecentFixturesSection fixtures={data.recentFixtures} />
              <UpcomingFixturesSection fixtures={data.upcomingFixtures} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable league name / button
// ---------------------------------------------------------------------------

export function LeagueButton({
  league,
  children,
  className,
}: {
  league: { id: number; name: string; logo: string; country: string; flagUrl: string | null }
  children: React.ReactNode
  className?: string
}) {
  const { openLeague } = useLeaguePanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openLeague(league)
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
