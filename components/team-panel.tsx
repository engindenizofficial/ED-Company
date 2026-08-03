"use client"

import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Award,
  Calendar,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MapPin,
  Medal,
  Shield,
  ShieldOff,
  Star,
  Trophy,
  UserCheck,
  Users,
  X,
} from "lucide-react"
import { useState } from "react"
import { useTeamPanel } from "@/contexts/team-context"
import { PlayerButton } from "@/components/player-panel"
import { cn } from "@/lib/utils"
import type {
  Fixture,
  SquadPlayer,
  StandingRow,
  TeamCoach,
  TeamSeasonStats,
  TeamTopScorer,
  TeamTransfer,
  TeamTrophy,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul",
  })
}

function FormDot({ result }: { result: "W" | "D" | "L" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
        result === "W" && "bg-primary/15 text-primary",
        result === "D" && "bg-secondary text-muted-foreground border border-border",
        result === "L" && "bg-destructive/15 text-destructive",
      )}
    >
      {result}
    </span>
  )
}

function SectionHeader({ icon, title, open, onToggle, badge }: {
  icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; badge?: string | number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          {icon}
        </span>
        <span className="text-sm font-bold text-foreground">{title}</span>
        {badge !== undefined && (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {open
        ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  )
}

// Stat bar for season stats
function StatBar({ label, value, max, accent = false }: {
  label: string; value: number; max: number; accent?: boolean
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all", accent ? "bg-accent" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Season Stats
// ---------------------------------------------------------------------------

function SeasonStatsSection({ stats }: { stats: TeamSeasonStats }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Sezon İstatistikleri"
        open={open}
        onToggle={() => setOpen(p => !p)}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {/* W/D/L big numbers */}
          <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border overflow-hidden">
            {[
              { label: "Galibiyet", value: stats.wins, cls: "text-primary" },
              { label: "Beraberlik", value: stats.draws, cls: "text-muted-foreground" },
              { label: "Mağlubiyet", value: stats.losses, cls: "text-destructive" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="flex flex-col items-center gap-0.5 py-3 bg-secondary/30">
                <span className={cn("text-3xl font-black tabular-nums leading-none", cls)}>{value}</span>
                <span className="text-[10px] tracking-wide uppercase text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Bars */}
          <div className="flex flex-col gap-3">
            <StatBar label="Oynanan Maç" value={stats.played} max={38} />
            <StatBar label="Maç başı atılan gol (ort.)" value={parseFloat(stats.goalsForAvg.toFixed(2))} max={4} accent />
            <StatBar label="Maç başı yenilen gol (ort.)" value={parseFloat(stats.goalsAgainstAvg.toFixed(2))} max={4} />
            <StatBar label="Gol yemeden geçen maç" value={stats.cleanSheets} max={stats.played} />
            <StatBar label="Gol atamadığı maç" value={stats.failedToScore} max={stats.played} accent />
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function FormSection({ stats }: { stats: TeamSeasonStats }) {
  const [open, setOpen] = useState(true)
  const recent = stats.recent.slice(0, 6)
  if (recent.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Son Form"
        open={open}
        onToggle={() => setOpen(p => !p)}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-3">
          {/* Form dots row */}
          <div className="flex items-center gap-1.5">
            {recent.map((g, i) => <FormDot key={i} result={g.result} />)}
          </div>
          {/* Match rows */}
          <div className="flex flex-col gap-1">
            {recent.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FormDot result={g.result} />
                  <span className="truncate font-semibold text-foreground">{g.opponent}</span>
                  <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {g.home ? "Ev" : "Dep"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-black tabular-nums text-foreground">{g.scored}–{g.conceded}</span>
                  <span className="text-[10px] text-muted-foreground">{kickoff(g.date)}</span>
                </div>
              </div>
            ))}
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
  const finished = fixtures.filter(f => /FT|AET|PEN/.test(f.statusShort))
  if (finished.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Calendar className="h-3.5 w-3.5" />}
        title="Son Maçlar"
        open={open}
        onToggle={() => setOpen(p => !p)}
        badge={finished.length}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-1.5">
          {finished.map(f => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.league.logo} alt="" className="h-3.5 w-3.5 object-contain opacity-80" />
                  <span className="text-[10px] text-muted-foreground truncate">{f.league.name}</span>
                  {f.league.round && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/50">· {f.league.round}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-4 w-4 object-contain" />
                  <span className="text-xs font-semibold text-foreground truncate">{f.home.name}</span>
                  <span className="shrink-0 text-muted-foreground/50">–</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-4 w-4 object-contain" />
                  <span className="text-xs font-semibold text-foreground truncate">{f.away.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm font-black tabular-nums text-foreground">{f.goalsHome} – {f.goalsAway}</span>
                <span className="text-[10px] text-muted-foreground">{kickoff(f.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

function CoachSection({ coach }: { coach: TeamCoach }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<UserCheck className="h-3.5 w-3.5" />}
        title="Teknik Direktör"
        open={open}
        onToggle={() => setOpen(p => !p)}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {/* Coach identity */}
          <div className="flex items-center gap-3">
            {coach.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coach.photo}
                alt={coach.name}
                className="h-16 w-16 rounded-2xl object-cover border border-border shrink-0"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary border border-border">
                <UserCheck className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-base font-black text-foreground leading-tight">{coach.name}</span>
              <div className="flex flex-wrap gap-1.5">
                {coach.nationality && (
                  <span className="rounded-lg bg-secondary border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {coach.nationality}
                  </span>
                )}
                {coach.age != null && (
                  <span className="rounded-lg bg-secondary border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {coach.age} yaş
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Career */}
          {coach.career.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 px-1">Kariyer</p>
              {coach.career.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {c.team.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.team.logo} alt="" className="h-5 w-5 object-contain" />
                    )}
                    <span className="text-xs font-semibold text-foreground">{c.team.name}</span>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {c.start ? c.start.slice(0, 4) : "?"} – {c.end ? c.end.slice(0, 4) : "günümüz"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Squad
// ---------------------------------------------------------------------------

const POS_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 }
const POS_LABEL: Record<string, string> = {
  Goalkeeper: "Kaleci", Defender: "Defans", Midfielder: "Orta Saha", Attacker: "Forvet",
}

function SquadSection({ squad }: { squad: SquadPlayer[] }) {
  const [open, setOpen] = useState(false)
  if (squad.length === 0) return null

  const grouped = squad.reduce<Record<string, SquadPlayer[]>>((acc, p) => {
    const pos = p.pos ?? "Diğer"
    if (!acc[pos]) acc[pos] = []
    acc[pos].push(p)
    return acc
  }, {})
  const positions = Object.keys(grouped).sort((a, b) => (POS_ORDER[a] ?? 99) - (POS_ORDER[b] ?? 99))

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Users className="h-3.5 w-3.5" />}
        title="Kadro"
        open={open}
        onToggle={() => setOpen(p => !p)}
        badge={squad.length}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {positions.map(pos => (
            <div key={pos}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 px-1">
                {POS_LABEL[pos] ?? pos}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {grouped[pos].map(p => (
                  <PlayerButton
                    key={p.id}
                    player={{ id: p.id, name: p.name, photo: p.photo ?? null }}
                    className="group flex w-full items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
                  >
                    {/* Photo or number */}
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
                        <span className="text-[10px] font-black text-muted-foreground">
                          {p.number != null ? p.number : p.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {p.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {p.number != null && (
                          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">#{p.number}</span>
                        )}
                        {p.age != null && (
                          <span className="text-[10px] text-muted-foreground/60">{p.age} yaş</span>
                        )}
                      </div>
                    </div>
                  </PlayerButton>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top Scorers — shows ALL fetched columns: goals, assists, appearances, rating, yellow/red cards, pos
// ---------------------------------------------------------------------------

function TopScorersSection({ scorers }: { scorers: TeamTopScorer[] }) {
  const [open, setOpen] = useState(false)
  if (scorers.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Star className="h-3.5 w-3.5" />}
        title="Lig Gol Krallığı"
        open={open}
        onToggle={() => setOpen(p => !p)}
        badge={`Top ${scorers.length}`}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="pb-2 pr-2 font-semibold w-6">#</th>
                  <th className="pb-2 pr-3 font-semibold">Oyuncu</th>
                  <th className="pb-2 px-1.5 font-semibold text-center" title="Gol">G</th>
                  <th className="pb-2 px-1.5 font-semibold text-center" title="Asist">A</th>
                  <th className="pb-2 px-1.5 font-semibold text-center" title="Maç">M</th>
                  <th className="pb-2 px-1.5 font-semibold text-center" title="Puan">Puan</th>
                  <th className="pb-2 px-1.5 font-semibold text-center" title="Sarı Kart">🟨</th>
                  <th className="pb-2 pl-1.5 font-semibold text-center" title="Kırmızı Kart">🟥</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {scorers.map((s, i) => (
                  <tr key={s.player.id} className="hover:bg-secondary/40 transition-colors group">
                    <td className="py-2 pr-2 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <PlayerButton
                        player={{ id: s.player.id, name: s.player.name, photo: s.player.photo ?? null }}
                        className="flex items-center gap-2"
                      >
                        {s.player.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.player.photo} alt="" className="h-6 w-6 rounded-full object-cover border border-border shrink-0" />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate leading-none">
                            {s.player.name}
                          </span>
                          {s.pos && (
                            <span className="text-[9px] uppercase text-muted-foreground/60 leading-none">{s.pos}</span>
                          )}
                        </div>
                      </PlayerButton>
                    </td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-black text-primary">{s.goals}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-foreground">{s.assists}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">
                      {s.rating ? parseFloat(s.rating).toFixed(1) : "–"}
                    </td>
                    <td className="py-2 px-1.5 text-center tabular-nums text-muted-foreground">{s.yellowCards}</td>
                    <td className="py-2 pl-1.5 text-center tabular-nums text-muted-foreground">{s.redCards}</td>
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
// Standings — includes goalsFor, goalsAgainst and form dots
// ---------------------------------------------------------------------------

function StandingsSection({ standings, teamId }: { standings: StandingRow[]; teamId: number }) {
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
        onToggle={() => setOpen(p => !p)}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {Object.entries(groups).map(([group, rows]) => (
            <div key={group}>
              {Object.keys(groups).length > 1 && (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 px-1">{group}</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                      <th className="pb-1.5 pr-2 font-semibold w-6">#</th>
                      <th className="pb-1.5 pr-3 font-semibold">Takım</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Oynanan">O</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Galibiyet">G</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Beraberlik">B</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Mağlubiyet">M</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Atılan">A</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Yenilen">Y</th>
                      <th className="pb-1.5 px-1.5 font-semibold text-center" title="Puan">P</th>
                      <th className="pb-1.5 pl-1.5 font-semibold text-center" title="Son 5 maç">Form</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map(r => {
                      const isTeam = r.teamId === teamId
                      const formChars = (r.form ?? "").slice(-5).split("")
                      return (
                        <tr
                          key={r.rank}
                          className={cn(
                            "transition-colors",
                            isTeam
                              ? "bg-primary/8 font-semibold"
                              : "hover:bg-secondary/40",
                          )}
                        >
                          <td className="py-1.5 pr-2 tabular-nums text-muted-foreground font-semibold">{r.rank}</td>
                          <td className={cn("py-1.5 pr-3 truncate max-w-[100px]", isTeam && "text-primary font-bold")}>
                            {r.team}
                          </td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-muted-foreground">{r.played}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-primary font-semibold">{r.win}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-muted-foreground">{r.draw}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-destructive">{r.lose}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-foreground">{r.goalsFor}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums text-foreground">{r.goalsAgainst}</td>
                          <td className="py-1.5 px-1.5 text-center tabular-nums font-black text-foreground">{r.points}</td>
                          <td className="py-1.5 pl-1.5">
                            <div className="flex items-center gap-0.5 justify-center">
                              {formChars.map((ch, fi) => (
                                <span
                                  key={fi}
                                  className={cn(
                                    "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-black leading-none",
                                    ch === "W" && "bg-primary/20 text-primary",
                                    ch === "D" && "bg-secondary text-muted-foreground",
                                    ch === "L" && "bg-destructive/20 text-destructive",
                                  )}
                                >
                                  {ch}
                                </span>
                              ))}
                            </div>
                          </td>
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
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

function TrophiesSection({ trophies }: { trophies: TeamTrophy[] }) {
  const [open, setOpen] = useState(false)
  if (trophies.length === 0) return null

  const won = trophies.filter(t => t.place === "Winner")
  const runnerUp = trophies.filter(t => t.place === "Runner-up" || t.place === "2nd Place")
  const other = trophies.filter(t => t.place !== "Winner" && t.place !== "Runner-up" && t.place !== "2nd Place")

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<Trophy className="h-3.5 w-3.5" />}
        title="Kupa ve Şampiyonluklar"
        open={open}
        onToggle={() => setOpen(p => !p)}
        badge={won.length > 0 ? `${won.length} şampiyonluk` : trophies.length}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {won.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                <Trophy className="h-3 w-3 text-primary" />
                Şampiyonluklar ({won.length})
              </p>
              {won.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{t.league}</span>
                    <span className="text-[10px] text-muted-foreground">{t.country}</span>
                  </div>
                  <span className="tabular-nums text-xs font-bold text-primary">{t.season}</span>
                </div>
              ))}
            </div>
          )}
          {runnerUp.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                <Medal className="h-3 w-3 text-accent" />
                İkinciler ({runnerUp.length})
              </p>
              {runnerUp.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{t.league}</span>
                    <span className="text-[10px] text-muted-foreground">{t.country}</span>
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground">{t.season}</span>
                </div>
              ))}
            </div>
          )}
          {other.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                <Award className="h-3 w-3 text-muted-foreground" />
                Diğer ({other.length})
              </p>
              {other.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{t.league}</span>
                    <span className="text-[10px] text-muted-foreground">{t.country} · {t.place}</span>
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground">{t.season}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Transfers — incoming/outgoing with player photo, team logos, type badge, date
// ---------------------------------------------------------------------------

function TransfersSection({ transfers, teamId }: { transfers: TeamTransfer[]; teamId: number }) {
  const [open, setOpen] = useState(false)
  if (transfers.length === 0) return null

  const incoming = transfers.filter(t => t.teamTo.id === teamId)
  const outgoing = transfers.filter(t => t.teamFrom.id === teamId)

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
        title="Transferler"
        open={open}
        onToggle={() => setOpen(p => !p)}
        badge={transfers.length}
      />
      {open && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col gap-4">
          {incoming.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                <ArrowDownLeft className="h-3 w-3 text-primary" />
                Gelenler ({incoming.length})
              </p>
              {incoming.map((t, i) => (
                <TransferRow key={i} transfer={t} direction="in" />
              ))}
            </div>
          )}
          {outgoing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                <ArrowUpRight className="h-3 w-3 text-destructive" />
                Gidenler ({outgoing.length})
              </p>
              {outgoing.map((t, i) => (
                <TransferRow key={i} transfer={t} direction="out" />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TransferRow({ transfer: t, direction }: { transfer: TeamTransfer; direction: "in" | "out" }) {
  const fromTeam = t.teamFrom
  const toTeam = t.teamTo
  const isIn = direction === "in"

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
        isIn
          ? "border-primary/20 bg-primary/5"
          : "border-border/60 bg-secondary/30",
      )}
    >
      {/* Player identity */}
      <PlayerButton
        player={{ id: t.player.id, name: t.player.name, photo: t.player.photo ?? null }}
        className="flex min-w-0 items-center gap-2.5"
      >
        {t.player.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.player.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover border border-border" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 text-left">
          <p className="truncate text-xs font-semibold text-foreground hover:text-primary transition-colors">
            {t.player.name}
          </p>
          {/* Transfer flow: from → to with logos */}
          <div className="flex items-center gap-1 mt-0.5">
            {fromTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fromTeam.logo} alt="" className="h-3 w-3 object-contain opacity-70" />
            )}
            <span className="text-[10px] text-muted-foreground truncate">{fromTeam.name}</span>
            <span className="text-[10px] text-muted-foreground/40">→</span>
            {toTeam.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={toTeam.logo} alt="" className="h-3 w-3 object-contain opacity-70" />
            )}
            <span className="text-[10px] text-muted-foreground truncate">{toTeam.name}</span>
          </div>
        </div>
      </PlayerButton>

      {/* Type + date */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {t.type && t.type !== "N/A" && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              isIn
                ? "border border-primary/30 bg-primary/10 text-primary"
                : "border border-border bg-secondary text-muted-foreground",
            )}
          >
            {t.type}
          </span>
        )}
        {t.date && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{t.date.slice(0, 7)}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel Modal
// ---------------------------------------------------------------------------

export function TeamPanel() {
  const { panel, closeTeam } = useTeamPanel()
  if (!panel) return null
  const { team, data, loading, error } = panel

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${team.name} takım bilgileri`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeTeam}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-background shadow-2xl max-h-[92dvh] sm:mx-4 sm:rounded-3xl sm:max-h-[90vh]">

        {/* Header — venue image as blurred background if available */}
        <div className="relative shrink-0 overflow-hidden">
          {data?.venue.image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.venue.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-[0.12] blur-sm scale-110"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-card/60 to-card" aria-hidden="true" />
            </>
          )}

          <div className="relative flex items-center gap-4 border-b border-border/60 px-5 py-4">
            {/* Logo */}
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo}
                alt={team.name}
                className="h-14 w-14 shrink-0 object-contain drop-shadow-md"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            {/* Team name + venue info */}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black leading-tight text-foreground truncate">{team.name}</h2>
              {data?.venue.name && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {data.venue.name}
                    {data.venue.city && `, ${data.venue.city}`}
                  </span>
                  {data.venue.capacity != null && (
                    <span className="rounded-lg border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {data.venue.capacity.toLocaleString("tr-TR")} kişilik
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={closeTeam}
              aria-label="Kapat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Season + coach meta bar */}
          {data && (
            <div className="relative flex items-center gap-3 border-b border-border/60 bg-secondary/40 px-5 py-2">
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground/70">Sezon</span>
              <span className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                {data.currentSeason}/{String(data.currentSeason + 1).slice(2)}
              </span>
              {data.coach && (
                <>
                  <span className="h-3 w-px bg-border" />
                  <UserCheck className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium truncate">{data.coach.name}</span>
                  {data.coach.nationality && (
                    <span className="ml-auto text-[10px] text-muted-foreground/60">{data.coach.nationality}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Takım verileri yükleniyor...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-destructive/60" />
              <p className="text-sm font-bold text-destructive">Veri alınamadı</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col gap-2">
              {data.stats && <SeasonStatsSection stats={data.stats} />}
              {data.stats && <FormSection stats={data.stats} />}
              {data.coach && <CoachSection coach={data.coach} />}
              <RecentFixturesSection fixtures={data.recentFixtures} />
              <SquadSection squad={data.squad} />
              {data.topScorers.length > 0 && <TopScorersSection scorers={data.topScorers} />}
              <StandingsSection standings={data.standings} teamId={team.id} />
              {data.trophies.length > 0 && <TrophiesSection trophies={data.trophies} />}
              {data.transfers.length > 0 && <TransfersSection transfers={data.transfers} teamId={team.id} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable team name / button
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
