"use client"

import {
  Activity,
  ArrowLeftRight,
  Award,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Medal,
  Shield,
  ShieldAlert,
  Star,
  Trophy,
  UserRound,
  UserRoundX,
  X,
} from "lucide-react"
import { useState } from "react"
import { usePlayerPanel } from "@/contexts/player-context"
import { cn } from "@/lib/utils"
import type {
  PlayerSeasonStats,
  SidelinedEntry,
  Transfer,
  Trophy as TrophyType,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POS_LABEL: Record<string, string> = {
  Goalkeeper: "Kaleci",
  Defender: "Defans",
  Midfielder: "Orta Saha",
  Attacker: "Forvet",
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

function StatBar({
  label,
  value,
  max,
  accent = false,
  suffix,
}: {
  label: string
  value: number
  max: number
  accent?: boolean
  suffix?: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">
          {value}{suffix ?? ""}
        </span>
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

// ---------------------------------------------------------------------------
// Season Stats Section
// ---------------------------------------------------------------------------

function SeasonStatsSection({ stats }: { stats: PlayerSeasonStats[] }) {
  const [open, setOpen] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (stats.length === 0) return null
  const s = stats[selectedIdx]

  const goals = s.goals ?? 0
  const assists = s.assists ?? 0
  const appearances = s.appearances ?? 0
  const lineups = s.lineups ?? 0
  const minutes = s.minutes ?? 0
  const yellow = s.yellowCards ?? 0
  const yellowRed = s.yellowRedCards ?? 0
  const red = s.redCards ?? 0
  const rating = s.rating ? parseFloat(s.rating) : null
  // Shots
  const shotsTotal = s.shotsTotal ?? 0
  const shotsOn = s.shotsOn ?? 0
  // Passes
  const passesTotal = s.passesTotal ?? 0
  const passesKey = s.passesKey ?? 0
  const passAccuracy = s.passesAccuracy ? parseFloat(s.passesAccuracy) : null
  // Tackles
  const tacklesTotal = s.tacklesTotal ?? 0
  const interceptions = s.interceptions ?? 0
  const blockedShots = s.blockedShots ?? 0
  // Duels
  const duelsTotal = s.duelsTotal ?? 0
  const duelsWon = s.duelsWon ?? 0
  // Dribbles
  const dribblesAttempted = s.dribblesAttempted ?? 0
  const dribblesSuccess = s.dribblesSuccess ?? 0
  // Fouls
  const foulsDrawn = s.foulsDrawn ?? 0
  const foulsCommitted = s.foulsCommitted ?? 0
  // Offsides
  const offsides = s.offsides ?? 0
  // Penalty
  const penaltyWon = s.penaltyWon ?? 0
  const penaltyScored = s.penaltyScored ?? 0
  const penaltyMissed = s.penaltyMissed ?? 0
  const penaltySaved = s.penaltySaved ?? 0

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title="Sezon İstatistikleri"
        open={open}
        onToggle={() => setOpen((p) => !p)}
      />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          {/* Season selector */}
          {stats.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {stats.map((st, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    i === selectedIdx
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                  )}
                >
                  {st.season}/{String(st.season + 1).slice(2)}
                  {st.league.name ? ` · ${st.league.name}` : ""}
                </button>
              ))}
            </div>
          )}

          {/* Team & League */}
          <div className="mb-4 flex items-center gap-2">
            {s.team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.team.logo} alt="" className="h-7 w-7 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{s.team.name}</p>
              <div className="flex items-center gap-1.5">
                {s.league.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.league.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                )}
                <p className="truncate text-[11px] text-muted-foreground">{s.league.name}</p>
              </div>
            </div>
            {rating != null && (
              <div className="flex flex-col items-center rounded-lg bg-primary/10 px-2.5 py-1.5">
                <span className="text-lg font-extrabold tabular-nums text-primary">{rating.toFixed(1)}</span>
                <span className="text-[9px] text-muted-foreground">Rating</span>
              </div>
            )}
          </div>

          {/* Key numbers */}
          <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-secondary/50 py-3">
            {[
              { label: "Gol", value: goals, color: "text-primary" },
              { label: "Asist", value: assists, color: "text-accent-foreground" },
              { label: "Maç", value: appearances, color: "text-foreground" },
              { label: "11'de", value: lineups, color: "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className={cn("text-xl font-extrabold tabular-nums", color)}>{value}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Stat bars */}
          <div className="flex flex-col gap-3">
            <StatBar
              label="Oynanan dakika"
              value={minutes}
              max={Math.max(minutes, 3420)}
              suffix=" dk"
            />
            {shotsTotal > 0 && (
              <StatBar
                label={`Şut isabeti (${shotsOn}/${shotsTotal})`}
                value={shotsOn}
                max={shotsTotal}
                accent
              />
            )}
            {passesTotal > 0 && (
              <StatBar
                label={`Pas${passAccuracy != null ? ` · ${passAccuracy.toFixed(0)}% isabet` : ""}${passesKey > 0 ? ` · ${passesKey} kilit` : ""}`}
                value={passesTotal}
                max={Math.max(passesTotal, 1000)}
              />
            )}
            {tacklesTotal > 0 && (
              <StatBar
                label={`Top kapma${interceptions > 0 ? ` · ${interceptions} müdahale` : ""}${blockedShots > 0 ? ` · ${blockedShots} blok` : ""}`}
                value={tacklesTotal}
                max={Math.max(tacklesTotal, 100)}
                accent
              />
            )}
            {duelsTotal > 0 && (
              <StatBar
                label={`İkili mücadele (${duelsWon}/${duelsTotal} kazanıldı)`}
                value={duelsWon}
                max={duelsTotal}
              />
            )}
            {dribblesAttempted > 0 && (
              <StatBar
                label={`Dribling (${dribblesSuccess}/${dribblesAttempted})`}
                value={dribblesSuccess}
                max={dribblesAttempted}
                accent
              />
            )}
            {foulsDrawn > 0 && (
              <StatBar
                label={`Faul kazanıldı · ${foulsCommitted > 0 ? `${foulsCommitted} yapıldı` : ""}`}
                value={foulsDrawn}
                max={Math.max(foulsDrawn, foulsCommitted, 50)}
              />
            )}
          </div>

          {/* Penalty & Offsides */}
          {(penaltyScored > 0 || penaltyMissed > 0 || penaltyWon > 0 || penaltySaved > 0 || offsides > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {penaltyScored > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs font-semibold tabular-nums text-primary">{penaltyScored}</span>
                  <span className="text-[10px] text-muted-foreground">Penaltı gol</span>
                </div>
              )}
              {penaltyMissed > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs font-semibold tabular-nums text-destructive">{penaltyMissed}</span>
                  <span className="text-[10px] text-muted-foreground">Kaçırılan</span>
                </div>
              )}
              {penaltyWon > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs font-semibold tabular-nums text-foreground">{penaltyWon}</span>
                  <span className="text-[10px] text-muted-foreground">Pen. kazanıldı</span>
                </div>
              )}
              {penaltySaved > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs font-semibold tabular-nums text-foreground">{penaltySaved}</span>
                  <span className="text-[10px] text-muted-foreground">Kurtarılan pen.</span>
                </div>
              )}
              {offsides > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs font-semibold tabular-nums text-foreground">{offsides}</span>
                  <span className="text-[10px] text-muted-foreground">Ofsayt</span>
                </div>
              )}
            </div>
          )}

          {/* Cards */}
          {(yellow > 0 || yellowRed > 0 || red > 0) && (
            <div className="mt-3 flex items-center gap-2">
              {yellow > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-yellow-400" />
                  <span className="text-xs font-semibold tabular-nums text-foreground">{yellow}</span>
                  <span className="text-[10px] text-muted-foreground">Sarı</span>
                </div>
              )}
              {yellowRed > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="inline-flex h-3.5 w-3 shrink-0">
                    <span className="inline-block h-3.5 w-2 -mr-0.5 rounded-[2px] bg-yellow-400" />
                    <span className="inline-block h-3.5 w-2 rounded-[2px] bg-red-500" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{yellowRed}</span>
                  <span className="text-[10px] text-muted-foreground">Sarı-kırmızı</span>
                </div>
              )}
              {red > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-red-500" />
                  <span className="text-xs font-semibold tabular-nums text-foreground">{red}</span>
                  <span className="text-[10px] text-muted-foreground">Kırmızı</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidelined / Injury History Section
// ---------------------------------------------------------------------------

function SidelinedSection({ sidelined }: { sidelined: SidelinedEntry[] }) {
  const [open, setOpen] = useState(false)
  if (sidelined.length === 0) return null

  function formatDate(d: string | null): string {
    if (!d) return "?"
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  function durationDays(start: string | null, end: string | null): string | null {
    if (!start || !end) return null
    const diff = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diff < 0) return null
    return `${diff} gün`
  }

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="Sakatlık / Ceza Geçmişi"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={sidelined.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {sidelined.map((s, i) => {
            const dur = durationDays(s.start, s.end)
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">{s.type}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(s.start)}
                    {s.end ? ` – ${formatDate(s.end)}` : " – devam"}
                  </span>
                </div>
                {dur && (
                  <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {dur}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transfers Section
// ---------------------------------------------------------------------------

function TransfersSection({ transfers }: { transfers: Transfer[] }) {
  const [open, setOpen] = useState(false)
  if (transfers.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
        title="Transfer Geçmişi"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={transfers.length}
      />
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {transfers.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5 truncate">
                  {t.teamFrom.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.teamFrom.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  )}
                  <span className="truncate text-muted-foreground">{t.teamFrom.name}</span>
                  <ArrowLeftRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {t.teamTo.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.teamTo.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  )}
                  <span className="truncate font-medium text-foreground">{t.teamTo.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {t.type && t.type !== "N/A" && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t.type}
                  </span>
                )}
                {t.date && (
                  <span className="text-[10px] text-muted-foreground">{t.date.slice(0, 7)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trophies Section
// ---------------------------------------------------------------------------

function TrophiesSection({ trophies }: { trophies: TrophyType[] }) {
  const [open, setOpen] = useState(false)
  if (trophies.length === 0) return null

  const won = trophies.filter((t) => t.place === "Winner")
  const runnerUp = trophies.filter(
    (t) => t.place === "Runner-up" || t.place === "2nd Place",
  )
  const other = trophies.filter(
    (t) => t.place !== "Winner" && t.place !== "Runner-up" && t.place !== "2nd Place",
  )

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Trophy className="h-3.5 w-3.5" />}
        title="Kupa ve Şampiyonluklar"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={won.length > 0 ? `${won.length} şampiyonluk` : trophies.length}
      />
      {open && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {won.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Trophy className="h-3 w-3 text-primary" /> Şampiyonluklar ({won.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {won.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{t.league}</span>
                      {t.country && (
                        <span className="text-[10px] text-muted-foreground">{t.country}</span>
                      )}
                    </div>
                    <span className="tabular-nums text-muted-foreground">{t.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {runnerUp.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Medal className="h-3 w-3 text-accent" /> İkinciler ({runnerUp.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {runnerUp.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{t.league}</span>
                      {t.country && (
                        <span className="text-[10px] text-muted-foreground">{t.country}</span>
                      )}
                    </div>
                    <span className="tabular-nums text-muted-foreground">{t.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {other.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Award className="h-3 w-3 text-muted-foreground" /> Diğer ({other.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {other.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{t.league}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {t.place}{t.country ? ` · ${t.country}` : ""}
                      </span>
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
// Career Summary Section (tüm sezonların özeti)
// ---------------------------------------------------------------------------

function CareerSummarySection({ stats }: { stats: PlayerSeasonStats[] }) {
  const [open, setOpen] = useState(false)
  if (stats.length < 2) return null

  const totals = stats.reduce(
    (acc, s) => ({
      goals: acc.goals + (s.goals ?? 0),
      assists: acc.assists + (s.assists ?? 0),
      appearances: acc.appearances + (s.appearances ?? 0),
      minutes: acc.minutes + (s.minutes ?? 0),
      yellow: acc.yellow + (s.yellowCards ?? 0),
      red: acc.red + (s.redCards ?? 0),
    }),
    { goals: 0, assists: 0, appearances: 0, minutes: 0, yellow: 0, red: 0 },
  )

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader
        icon={<Star className="h-3.5 w-3.5" />}
        title="Kariyer Özeti"
        open={open}
        onToggle={() => setOpen((p) => !p)}
        badge={`${stats.length} sezon`}
      />
      {open && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-secondary/50 py-3">
            {[
              { label: "Toplam Gol", value: totals.goals, color: "text-primary" },
              { label: "Toplam Asist", value: totals.assists, color: "text-accent-foreground" },
              { label: "Toplam Maç", value: totals.appearances, color: "text-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className={cn("text-xl font-extrabold tabular-nums", color)}>{value}</span>
                <span className="text-center text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Toplam dakika</span>
              <span className="font-semibold tabular-nums text-foreground">
                {totals.minutes.toLocaleString("tr-TR")} dk
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Maç başı gol</span>
              <span className="font-semibold tabular-nums text-foreground">
                {totals.appearances > 0
                  ? (totals.goals / totals.appearances).toFixed(2)
                  : "–"}
              </span>
            </div>
            {(totals.yellow > 0 || totals.red > 0) && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kartlar</span>
                <div className="flex items-center gap-2">
                  {totals.yellow > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-3 w-2 rounded-[2px] bg-yellow-400" />
                      <span className="tabular-nums text-foreground">{totals.yellow}</span>
                    </div>
                  )}
                  {totals.red > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-3 w-2 rounded-[2px] bg-red-500" />
                      <span className="tabular-nums text-foreground">{totals.red}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Sezon bazlı tablo */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="pb-1.5 pr-2 font-medium">Sezon</th>
                  <th className="pb-1.5 pr-2 font-medium">Takım</th>
                  <th className="pb-1.5 px-2 text-center font-medium">M</th>
                  <th className="pb-1.5 px-2 text-center font-medium">G</th>
                  <th className="pb-1.5 pl-2 text-center font-medium">A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.map((s, i) => (
                  <tr key={i} className="transition-colors hover:bg-secondary/50">
                    <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                      {s.season}/{String(s.season + 1).slice(2)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        {s.team.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.team.logo} alt="" className="h-4 w-4 object-contain" />
                        )}
                        <span className="truncate font-medium text-foreground max-w-[80px]">
                          {s.team.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums text-muted-foreground">
                      {s.appearances ?? "–"}
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums font-bold text-primary">
                      {s.goals ?? "–"}
                    </td>
                    <td className="py-1.5 pl-2 text-center tabular-nums text-accent-foreground">
                      {s.assists ?? "–"}
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
// Main Panel Modal
// ---------------------------------------------------------------------------

export function PlayerPanel() {
  const { panel, closePlayer } = usePlayerPanel()
  if (!panel) return null
  const { player, data, loading, error } = panel

  const profile = data?.profile

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} oyuncu bilgileri`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closePlayer}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl max-h-[90dvh] sm:mx-4 sm:rounded-2xl sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 shrink-0">
          {player.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photo}
              alt={player.name}
              className="h-12 w-12 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary border border-border">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-foreground">
              {player.name}
            </h2>
            {profile ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {profile.nationality && <span>{profile.nationality}</span>}
                {profile.age && (
                  <>
                    <span className="text-border">·</span>
                    <span>{profile.age} yaş</span>
                  </>
                )}
                {profile.position && (
                  <>
                    <span className="text-border">·</span>
                    <span>{POS_LABEL[profile.position] ?? profile.position}</span>
                  </>
                )}
                {profile.number != null && (
                  <>
                    <span className="text-border">·</span>
                    <span>#{profile.number}</span>
                  </>
                )}
                {profile.height && (
                  <>
                    <span className="text-border">·</span>
                    <span>{profile.height}</span>
                  </>
                )}
                {profile.weight && (
                  <>
                    <span className="text-border">·</span>
                    <span>{profile.weight}</span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Yükleniyor...</p>
            )}
          </div>
          <button
            type="button"
            onClick={closePlayer}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current club banner */}
        {profile?.team && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2 shrink-0">
            {profile.team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.team.logo} alt="" className="h-4 w-4 object-contain" />
            )}
            <span className="text-xs text-muted-foreground">{profile.team.name}</span>
            {profile.league && (
              <>
                <span className="text-border">·</span>
                {profile.league.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.league.logo} alt="" className="h-4 w-4 object-contain" />
                )}
                <span className="text-xs text-muted-foreground">{profile.league.name}</span>
                <span className="text-border">·</span>
                <span className="text-xs text-muted-foreground">
                  {profile.league.season}/{String(profile.league.season + 1).slice(2)}
                </span>
              </>
            )}
            {profile.injured && (
              <span className="ml-auto rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                Sakatlanmış
              </span>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Oyuncu verileri yükleniyor...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-12 text-center">
              <UserRoundX className="h-8 w-8 text-destructive/60" />
              <p className="text-sm font-semibold text-destructive">Veri alınamadı</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col gap-4">
              <SeasonStatsSection stats={data.stats} />
              <CareerSummarySection stats={data.stats} />
              {data.trophies.length > 0 && <TrophiesSection trophies={data.trophies} />}
              {data.transfers.length > 0 && <TransfersSection transfers={data.transfers} />}
              {data.sidelined.length > 0 && <SidelinedSection sidelined={data.sidelined} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable clickable player button (takım paneli gibi yerlerden tetiklenir)
// ---------------------------------------------------------------------------

export function PlayerButton({
  player,
  children,
  className,
}: {
  player: { id: number; name: string; photo: string | null }
  children: React.ReactNode
  className?: string
}) {
  const { openPlayer } = usePlayerPanel()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openPlayer(player)
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
