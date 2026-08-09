"use client"

import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Shield,
  ShieldOff,
  Square,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"
import { useLeaguePanel } from "@/contexts/league-context"
import { PlayerButton } from "@/components/player-panel"
import { TeamButton } from "@/components/team-panel"
import { cn } from "@/lib/utils"
import { toTurkishCountry } from "@/lib/tr-aliases"
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueTopAssist,
  LeagueTopCard,
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

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

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
      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="text-sm font-bold text-foreground">{title}</span>
        {badge !== undefined && (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
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

function PlayerAvatar({ photo, name }: { photo: string | null; name: string }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
    />
  ) : (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
      <Users className="h-3 w-3 text-muted-foreground" />
    </div>
  )
}

function TeamLogo({ logo, name }: { logo: string; name: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt={name} title={name} className="mx-auto h-5 w-5 object-contain" />
  ) : (
    <span className="text-[10px] text-muted-foreground">{name}</span>
  )
}

// ---------------------------------------------------------------------------
// Season Overview
// ---------------------------------------------------------------------------

function SeasonOverviewSection({ stats }: { stats: LeagueSeasonStats }) {
  const [open, setOpen] = useState(false)
  const items = [
    { label: "Oynanan Maç", value: stats.totalMatches.toLocaleString("tr-TR") },
    { label: "Toplam Gol", value: stats.totalGoals.toLocaleString("tr-TR") },
    { label: "Maç Başı Gol", value: stats.avgGoalsPerMatch.toFixed(2) },
  ]
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Sezon Özeti"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="grid grid-cols-3 gap-2">
            {items.map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-0.5 rounded-xl border border-border/60 bg-secondary/30 px-2 py-3"
              >
                <span className="text-xl font-black tabular-nums leading-none text-foreground">{value}</span>
                <span className="mt-1 text-center text-[10px] leading-tight text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsSection({ standings }: { standings: StandingRow[] }) {
  const [open, setOpen] = useState(false)
  if (standings.length === 0) return null

  const groups = standings.reduce<Record<string, StandingRow[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = []
    acc[r.group].push(r)
    return acc
  }, {})

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Shield className="h-3.5 w-3.5" />}
        title="Puan Durumu"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={standings.length}
      />
      {open && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4">
          {Object.entries(groups).map(([group, rows]) => (
            <div key={group}>
              {Object.keys(groups).length > 1 && (
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                  {group}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                      <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                      <th className="pb-2 pr-2 font-semibold">Takım</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Oynanan">O</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Galibiyet">G</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Beraberlik">B</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Mağlubiyet">M</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Atılan Gol">A</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Yenilen Gol">Y</th>
                      <th className="px-1.5 pb-2 text-center font-semibold" title="Averaj">AV</th>
                      <th className="pl-1.5 pb-2 text-center font-semibold" title="Puan">P</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((r) => (
                      <tr key={r.rank} className="transition-colors hover:bg-secondary/40">
                        <td className="py-2 pr-2 tabular-nums text-muted-foreground">{r.rank}</td>
                        <td className="py-2 pr-2">
                          <TeamButton
                            team={{ id: r.teamId, name: r.team, logo: r.teamLogo }}
                            className="flex items-center gap-1.5"
                          >
                            {r.teamLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.teamLogo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                            ) : null}
                            <span className="max-w-[90px] truncate font-semibold text-foreground hover:text-primary">
                              {r.team}
                            </span>
                          </TeamButton>
                        </td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.played}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums font-semibold text-primary">{r.win}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-destructive">{r.lose}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.goalsFor}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{r.goalsAgainst}</td>
                        <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">
                          {r.goalsFor - r.goalsAgainst > 0 ? "+" : ""}
                          {r.goalsFor - r.goalsAgainst}
                        </td>
                        <td className="pl-1.5 py-2 text-center tabular-nums font-black text-foreground">
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
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Scorers
// ---------------------------------------------------------------------------

function TopScorersSection({ scorers }: { scorers: LeagueTopScorer[] }) {
  const [open, setOpen] = useState(false)
  if (scorers.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Star className="h-3.5 w-3.5" />}
        title="Gol Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${scorers.length}`}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Gol">G</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Asist">A</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                  <th className="pl-1.5 pb-2 text-center font-semibold" title="Ort.">Ort.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {scorers.map((s, i) => (
                  <tr key={s.player.id} className="transition-colors hover:bg-secondary/40">
                    <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <PlayerButton
                        player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                        className="flex items-center gap-2"
                      >
                        <PlayerAvatar photo={s.player.photo ?? null} name={s.player.name} />
                        <span className="font-semibold text-foreground hover:text-primary">{s.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      <TeamLogo logo={s.team.logo} name={s.team.name} />
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums font-black text-primary">{s.goals}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.assists}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                    <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">
                      {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Assists
// ---------------------------------------------------------------------------

function TopAssistsSection({ assists }: { assists: LeagueTopAssist[] }) {
  const [open, setOpen] = useState(false)
  if (assists.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Zap className="h-3.5 w-3.5" />}
        title="Asist Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${assists.length}`}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Asist">A</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Gol">G</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                  <th className="pl-1.5 pb-2 text-center font-semibold" title="Ort.">Ort.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {assists.map((s, i) => (
                  <tr key={s.player.id} className="transition-colors hover:bg-secondary/40">
                    <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <PlayerButton
                        player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                        className="flex items-center gap-2"
                      >
                        <PlayerAvatar photo={s.player.photo ?? null} name={s.player.name} />
                        <span className="font-semibold text-foreground hover:text-primary">{s.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      <TeamLogo logo={s.team.logo} name={s.team.name} />
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums font-black text-primary">{s.assists}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.goals}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                    <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">
                      {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Yellow Cards
// ---------------------------------------------------------------------------

function TopYellowCardsSection({ cards }: { cards: LeagueTopCard[] }) {
  const [open, setOpen] = useState(false)
  if (cards.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Square className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
        title="Sarı Kart Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${cards.length}`}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Sarı Kart">SK</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Kırmızı Kart">KK</th>
                  <th className="pl-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cards.map((c, i) => (
                  <tr key={c.player.id} className="transition-colors hover:bg-secondary/40">
                    <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <PlayerButton
                        player={{ id: c.player.id, name: c.player.name, photo: c.player.photo ?? null }}
                        className="flex items-center gap-2"
                      >
                        <PlayerAvatar photo={c.player.photo ?? null} name={c.player.name} />
                        <span className="font-semibold text-foreground hover:text-primary">{c.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      <TeamLogo logo={c.team.logo} name={c.team.name} />
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums font-black text-yellow-500">{c.yellow}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-destructive">{c.red}</td>
                    <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">{c.appearances}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Red Cards
// ---------------------------------------------------------------------------

function TopRedCardsSection({ cards }: { cards: LeagueTopCard[] }) {
  const [open, setOpen] = useState(false)
  if (cards.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Square className="h-3.5 w-3.5 fill-destructive text-destructive" />}
        title="Kırmızı Kart Krallığı"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`Top ${cards.length}`}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="w-6 pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Takım">T</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Kırmızı Kart">KK</th>
                  <th className="px-1.5 pb-2 text-center font-semibold" title="Sarı Kart">SK</th>
                  <th className="pl-1.5 pb-2 text-center font-semibold" title="Maç">M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cards.map((c, i) => (
                  <tr key={c.player.id} className="transition-colors hover:bg-secondary/40">
                    <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <PlayerButton
                        player={{ id: c.player.id, name: c.player.name, photo: c.player.photo ?? null }}
                        className="flex items-center gap-2"
                      >
                        <PlayerAvatar photo={c.player.photo ?? null} name={c.player.name} />
                        <span className="font-semibold text-foreground hover:text-primary">{c.player.name}</span>
                      </PlayerButton>
                    </td>
                    <td className="px-1.5 py-2 text-center">
                      <TeamLogo logo={c.team.logo} name={c.team.name} />
                    </td>
                    <td className="px-1.5 py-2 text-center tabular-nums font-black text-destructive">{c.red}</td>
                    <td className="px-1.5 py-2 text-center tabular-nums text-yellow-500">{c.yellow}</td>
                    <td className="pl-1.5 py-2 text-center tabular-nums text-muted-foreground">{c.appearances}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Recent Fixtures
// ---------------------------------------------------------------------------

function RecentFixturesSection({ fixtures }: { fixtures: Fixture[] }) {
  const [open, setOpen] = useState(false)
  if (fixtures.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Son Maçlar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={fixtures.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-4">
          {fixtures.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">
                  {f.league.round} · {kickoff(f.date)}
                </span>
                <div className="flex items-center gap-1.5 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  <span className="truncate text-xs font-semibold text-foreground">{f.home.name}</span>
                  <span className="shrink-0 font-black tabular-nums text-foreground">
                    {f.goalsHome} – {f.goalsAway}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  <span className="truncate text-xs font-semibold text-foreground">{f.away.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Upcoming Fixtures
// ---------------------------------------------------------------------------

function UpcomingFixturesSection({ fixtures }: { fixtures: Fixture[] }) {
  const [open, setOpen] = useState(false)
  if (fixtures.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Yaklaşan Maçlar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={fixtures.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-4">
          {fixtures.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">{f.league.round}</span>
                <div className="flex items-center gap-1.5 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  <span className="truncate text-xs font-semibold text-foreground">{f.home.name}</span>
                  <span className="shrink-0 text-muted-foreground">–</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  <span className="truncate text-xs font-semibold text-foreground">{f.away.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-black tabular-nums text-foreground">{matchTime(f.date)}</span>
                <span className="text-[10px] text-muted-foreground">{kickoffFull(f.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`${league.name} lig bilgileri`}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 shrink-0">
          {league.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={league.logo}
              alt={league.name}
              className="h-12 w-12 shrink-0 object-contain drop-shadow-sm"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary border border-border">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-black leading-tight text-foreground">{league.name}</h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              {league.flagUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={league.flagUrl} alt="" className="h-3 w-4 rounded-[2px] object-cover" />
              )}
              <p className="text-xs text-muted-foreground">{toTurkishCountry(league.country)}</p>
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
            <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {data.league.season}/{String(data.league.season + 1).slice(2)}
            </span>
            {data.seasonStats && (
              <>
                <span className="text-border">·</span>
                <span className="text-xs text-muted-foreground">
                  {data.seasonStats.totalMatches} maç
                </span>
                <span className="text-border">·</span>
                <span className="text-xs text-muted-foreground">
                  {data.seasonStats.totalGoals} gol
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
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-destructive/60" />
              <p className="text-sm font-semibold text-destructive">Veri alınamadı</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col gap-3">
              {data.seasonStats && <SeasonOverviewSection stats={data.seasonStats} />}
              <StandingsSection standings={data.standings} />
              <TopScorersSection scorers={data.topScorers} />
              <TopAssistsSection assists={data.topAssists} />
              <TopYellowCardsSection cards={data.topYellowCards ?? []} />
              <TopRedCardsSection cards={data.topRedCards ?? []} />
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
