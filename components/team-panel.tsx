"use client"

import {
  Activity,
  ArrowLeftRight,
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

function FormDot({ result }: { result: "W" | "D" | "L" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        result === "W" && "bg-primary/15 text-primary",
        result === "D" && "bg-secondary text-secondary-foreground border border-border",
        result === "L" && "bg-destructive/15 text-destructive",
      )}
    >
      {result}
    </span>
  )
}

function StatBar({ label, value, max, accent = false }: { label: string; value: number; max: number; accent?: boolean }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-all", accent ? "bg-accent" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, open, onToggle, badge }: {
  icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; badge?: string | number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left transition-colors hover:bg-secondary"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {badge !== undefined && (
          <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  )
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul" })
}

// ---------------------------------------------------------------------------
// Season Stats
// ---------------------------------------------------------------------------

function SeasonStatsSection({ stats }: { stats: TeamSeasonStats }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Activity className="h-3.5 w-3.5" />} title="Sezon İstatistikleri" open={open} onToggle={() => setOpen(p => !p)} />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          {/* W/D/L */}
          <div className="mb-4 flex items-center justify-around rounded-lg bg-secondary/50 py-3">
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
          <div className="flex flex-col gap-3">
            <StatBar label="Oynanan Maç" value={stats.played} max={38} />
            <StatBar label="Maç başı gol (ort.)" value={parseFloat(stats.goalsForAvg.toFixed(2))} max={4} accent />
            <StatBar label="Yenilen gol (ort.)" value={parseFloat(stats.goalsAgainstAvg.toFixed(2))} max={4} />
            <StatBar label="Gol yemeden geçen maç" value={stats.cleanSheets} max={stats.played} />
            <StatBar label="Gol atamadığı maç" value={stats.failedToScore} max={stats.played} accent />
          </div>
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Activity className="h-3.5 w-3.5" />} title="Son Form" open={open} onToggle={() => setOpen(p => !p)} />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-1.5">
            {recent.map((g, i) => <FormDot key={i} result={g.result} />)}
          </div>
          <div className="flex flex-col gap-1.5">
            {recent.map((g, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <FormDot result={g.result} />
                  <span className="truncate font-medium text-foreground">{g.opponent}</span>
                  <span className="shrink-0 text-muted-foreground">{g.home ? "(Ev)" : "(Dep)"}</span>
                </div>
                <span className="ml-2 shrink-0 font-bold tabular-nums text-foreground">{g.scored}–{g.conceded}</span>
              </div>
            ))}
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
  const finished = fixtures.filter(f => /FT|AET|PEN/.test(f.statusShort))
  if (finished.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Calendar className="h-3.5 w-3.5" />} title="Son Maçlar" open={open} onToggle={() => setOpen(p => !p)} badge={finished.length} />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {finished.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{f.league.name}</span>
                <div className="flex items-center gap-1 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.home.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.home.name}</span>
                  <span className="shrink-0 text-muted-foreground">–</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.away.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                  <span className="truncate font-medium text-foreground">{f.away.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-bold tabular-nums text-foreground">{f.goalsHome} – {f.goalsAway}</span>
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
// Coach
// ---------------------------------------------------------------------------

function CoachSection({ coach }: { coach: TeamCoach }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<UserCheck className="h-3.5 w-3.5" />} title="Teknik Direktör" open={open} onToggle={() => setOpen(p => !p)} />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-4">
            {coach.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coach.photo} alt={coach.name} className="h-14 w-14 rounded-full object-cover border border-border" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
                <UserCheck className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-foreground">{coach.name}</span>
              {coach.nationality && <span className="text-xs text-muted-foreground">{coach.nationality}</span>}
              {coach.age && <span className="text-xs text-muted-foreground">{coach.age} yaş</span>}
            </div>
          </div>
          {coach.career.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Kariyer</p>
              <div className="flex flex-col gap-1.5">
                {coach.career.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      {c.team.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.team.logo} alt="" className="h-5 w-5 object-contain" />
                      )}
                      <span className="text-xs font-medium text-foreground">{c.team.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {c.start ? c.start.slice(0, 4) : "?"} – {c.end ? c.end.slice(0, 4) : "günümüz"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Squad
// ---------------------------------------------------------------------------

const POS_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 }
const POS_LABEL: Record<string, string> = { Goalkeeper: "Kaleci", Defender: "Defans", Midfielder: "Orta Saha", Attacker: "Forvet" }

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
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Users className="h-3.5 w-3.5" />} title="Kadro" open={open} onToggle={() => setOpen(p => !p)} badge={squad.length} />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {positions.map(pos => (
            <div key={pos}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{POS_LABEL[pos] ?? pos}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {grouped[pos].map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover border border-border" />
                    ) : p.number != null ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-bold tabular-nums text-secondary-foreground">
                        {p.number}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{p.name}</p>
                      {p.age != null && <p className="text-[10px] text-muted-foreground">{p.age} yaş</p>}
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
// Top Scorers
// ---------------------------------------------------------------------------

function TopScorersSection({ scorers }: { scorers: TeamTopScorer[] }) {
  const [open, setOpen] = useState(false)
  if (scorers.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Star className="h-3.5 w-3.5" />} title="Lig Gol Krallığı" open={open} onToggle={() => setOpen(p => !p)} badge={`Top ${scorers.length}`} />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-2 font-medium w-6">#</th>
                  <th className="pb-2 pr-2 font-medium">Oyuncu</th>
                  <th className="pb-2 px-2 font-medium text-center">G</th>
                  <th className="pb-2 px-2 font-medium text-center">A</th>
                  <th className="pb-2 px-2 font-medium text-center">M</th>
                  <th className="pb-2 pl-2 font-medium text-center">Ort.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scorers.map((s, i) => (
                  <tr key={s.player.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="py-2 pr-2 tabular-nums font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        {s.player.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.player.photo} alt="" className="h-6 w-6 rounded-full object-cover border border-border shrink-0" />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">{s.player.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center tabular-nums font-bold text-primary">{s.goals}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-accent-foreground">{s.assists}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-muted-foreground">{s.appearances}</td>
                    <td className="py-2 pl-2 text-center tabular-nums text-muted-foreground">
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
// Standings
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
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Shield className="h-3.5 w-3.5" />} title="Puan Durumu" open={open} onToggle={() => setOpen(p => !p)} />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {Object.entries(groups).map(([group, rows]) => (
            <div key={group}>
              {Object.keys(groups).length > 1 && (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group}</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
                      <th className="pb-1.5 pr-2 font-medium w-6">#</th>
                      <th className="pb-1.5 pr-2 font-medium">Takım</th>
                      <th className="pb-1.5 px-2 font-medium text-center">O</th>
                      <th className="pb-1.5 px-2 font-medium text-center">G</th>
                      <th className="pb-1.5 px-2 font-medium text-center">B</th>
                      <th className="pb-1.5 px-2 font-medium text-center">M</th>
                      <th className="pb-1.5 pl-2 font-medium text-center">P</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(r => {
                      const isTeam = r.teamId === teamId
                      return (
                        <tr key={r.rank} className={cn("transition-colors", isTeam ? "bg-primary/10 font-semibold" : "hover:bg-secondary/50")}>
                          <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{r.rank}</td>
                          <td className={cn("py-1.5 pr-2 truncate", isTeam && "text-primary font-semibold")}>{r.team}</td>
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
// Trophies
// ---------------------------------------------------------------------------

function TrophiesSection({ trophies }: { trophies: TeamTrophy[] }) {
  const [open, setOpen] = useState(false)
  if (trophies.length === 0) return null

  const won = trophies.filter(t => t.place === "Winner")
  const runnerUp = trophies.filter(t => t.place === "Runner-up" || t.place === "2nd Place")
  const other = trophies.filter(t => t.place !== "Winner" && t.place !== "Runner-up" && t.place !== "2nd Place")

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<Trophy className="h-3.5 w-3.5" />} title="Kupa ve Şampiyonluklar" open={open} onToggle={() => setOpen(p => !p)} badge={won.length > 0 ? `${won.length} şampiyonluk` : trophies.length} />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {won.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Trophy className="h-3 w-3 text-primary" /> Şampiyonluklar ({won.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {won.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <span className="font-medium text-foreground">{t.league}</span>
                    <span className="tabular-nums text-muted-foreground">{t.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {runnerUp.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Medal className="h-3 w-3 text-accent" /> İkinciler ({runnerUp.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {runnerUp.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-medium text-foreground">{t.league}</span>
                    <span className="tabular-nums text-muted-foreground">{t.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {other.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Award className="h-3 w-3 text-muted-foreground" /> Diğer ({other.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {other.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{t.league}</span>
                      <span className="text-[10px] text-muted-foreground">{t.place}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{t.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

function TransfersSection({ transfers, teamId }: { transfers: TeamTransfer[]; teamId: number }) {
  const [open, setOpen] = useState(false)
  if (transfers.length === 0) return null

  const incoming = transfers.filter(t => t.teamTo.id === teamId)
  const outgoing = transfers.filter(t => t.teamFrom.id === teamId)

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader icon={<ArrowLeftRight className="h-3.5 w-3.5" />} title="Transferler" open={open} onToggle={() => setOpen(p => !p)} badge={transfers.length} />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {incoming.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gelenler ({incoming.length})</p>
              <div className="flex flex-col gap-1.5">
                {incoming.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      {t.player.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.player.photo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover border border-border" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{t.player.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">← {t.teamFrom.name}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {t.type && t.type !== "N/A" && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t.type}</span>
                      )}
                      {t.date && <span className="text-[10px] text-muted-foreground">{t.date.slice(0, 7)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gidenler ({outgoing.length})</p>
              <div className="flex flex-col gap-1.5">
                {outgoing.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      {t.player.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.player.photo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover border border-border" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{t.player.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">→ {t.teamTo.name}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {t.type && t.type !== "N/A" && (
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{t.type}</span>
                      )}
                      {t.date && <span className="text-[10px] text-muted-foreground">{t.date.slice(0, 7)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeTeam} aria-hidden="true" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl max-h-[90dvh] sm:mx-4 sm:rounded-2xl sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 shrink-0">
          {team.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo} alt={team.name} className="h-11 w-11 object-contain drop-shadow-sm" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-foreground">{team.name}</h2>
            {data?.venue.name && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {data.venue.name}{data.venue.city ? `, ${data.venue.city}` : ""}{data.venue.capacity ? ` · ${data.venue.capacity.toLocaleString("tr-TR")} kişilik` : ""}
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
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2 shrink-0">
            <span className="text-xs text-muted-foreground">Sezon</span>
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {data.currentSeason}/{String(data.currentSeason + 1).slice(2)}
            </span>
            {data.coach && (
              <>
                <span className="text-border">·</span>
                <UserCheck className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{data.coach.name}</span>
              </>
            )}
          </div>
        )}

        {/* Scrollable content */}
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
