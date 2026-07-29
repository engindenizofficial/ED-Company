"use client"

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Users,
  Flag,
} from "lucide-react"
import { useState } from "react"
import type { AnalysisResponse, FormGame, InjuryItem, MatchEvent, StatItem, StandingRow, TeamLineup, TeamSeasonStats } from "@/lib/types"
import { FormBadge } from "./form-badge"
import { TeamButton } from "./team-panel"

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AnalysisPanel({
  data,
  isLoading,
  error,
}: {
  data: AnalysisResponse | undefined
  isLoading: boolean
  error: Error | undefined
}) {
  if (isLoading) return <AnalyzingState />

  if (error) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Analiz yapılamadı</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <p className="max-w-xs text-balance text-sm">Bu maç için detaylı analiz verisi hazırlanıyor.</p>
      </div>
    )
  }

  const { live } = data
  const { fixture } = live

  return (
    <div className="flex flex-col gap-2">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Match header                                                   */}
      {/* ---------------------------------------------------------------- */}
      <MatchHeader fixture={fixture} />

      {/* ---------------------------------------------------------------- */}
      {/* 2. Live events                                                    */}
      {/* ---------------------------------------------------------------- */}
      {live.events.length > 0 && (
        <Collapsible
          defaultOpen
          header={<SectionHeader icon={<Activity className="h-3.5 w-3.5" />} title={`Maç Olayları`} badge={String(live.events.length)} />}
        >
          <EventsList events={live.events} homeName={fixture.home.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. Match statistics                                               */}
      {/* ---------------------------------------------------------------- */}
      {live.statistics.length > 0 && (
        <Collapsible
          defaultOpen
          header={<SectionHeader icon={<BarChart3 className="h-3.5 w-3.5" />} title="İstatistikler" />}
        >
          <StatsList stats={live.statistics} homeName={fixture.home.name} awayName={fixture.away.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. Lineups                                                        */}
      {/* ---------------------------------------------------------------- */}
      {live.lineups.length > 0 && (
        <Collapsible
          header={<SectionHeader icon={<Users className="h-3.5 w-3.5" />} title="İlk 11" />}
        >
          <LineupsView lineups={live.lineups} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. Standings                                                      */}
      {/* ---------------------------------------------------------------- */}
      {live.standings.length > 0 && (
        <Collapsible
          header={<SectionHeader icon={<Shield className="h-3.5 w-3.5" />} title="Puan Durumu" />}
        >
          <StandingsTable standings={live.standings} homeId={fixture.home.id} awayId={fixture.away.id} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. Team season stats                                              */}
      {/* ---------------------------------------------------------------- */}
      {(live.homeStats || live.awayStats) && (
        <Collapsible
          header={<SectionHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title="Sezon İstatistikleri" />}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {live.homeStats && <TeamStatsCard stats={live.homeStats} label="Ev Sahibi" />}
            {live.awayStats && <TeamStatsCard stats={live.awayStats} label="Deplasman" />}
          </div>
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 7. H2H                                                            */}
      {/* ---------------------------------------------------------------- */}
      {live.h2h.length > 0 && (
        <Collapsible
          header={<SectionHeader icon={<Swords className="h-3.5 w-3.5" />} title="Karşılıklı Maçlar" badge={String(live.h2h.length)} />}
        >
          <H2HList h2h={live.h2h} homeName={fixture.home.name} awayName={fixture.away.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 8. Injuries                                                       */}
      {/* ---------------------------------------------------------------- */}
      {live.injuries.length > 0 && (
        <Collapsible
          header={<SectionHeader icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Sakatlık / Ceza" badge={String(live.injuries.length)} />}
        >
          <InjuryList injuries={live.injuries} />
        </Collapsible>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function AnalyzingState() {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-3">
      <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Veriler yükleniyor...</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match header
// ---------------------------------------------------------------------------

function MatchHeader({ fixture }: { fixture: AnalysisResponse["live"]["fixture"] }) {
  const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])
  const isLive = LIVE_STATUSES.has(fixture.statusShort)
  const homeGoals = fixture.goalsHome
  const awayGoals = fixture.goalsAway
  const hasScore = homeGoals != null && awayGoals != null
  const statusTr = translateStatus(fixture.statusShort, fixture.elapsed, fixture.elapsedExtra)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* League strip */}
      <div className="flex items-center justify-center gap-2 border-b border-border bg-secondary/40 px-4 py-2">
        {fixture.league.logo && (
          <img src={fixture.league.logo} alt="" className="h-4 w-4 object-contain" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground">
          {fixture.league.name}
          {fixture.league.round ? ` · ${fixture.league.round}` : ""}
        </span>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5">
        {/* Home */}
        <TeamButton team={fixture.home} className="flex flex-col items-center gap-2">
          {fixture.home.logo && (
            <img src={fixture.home.logo} alt={fixture.home.name} className="h-14 w-14 object-contain drop-shadow-sm" />
          )}
          <span className="text-center text-sm font-semibold text-foreground text-balance leading-tight hover:text-primary transition-colors">{fixture.home.name}</span>
        </TeamButton>

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-2 min-w-[72px]">
          {hasScore ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-3xl font-black tabular-nums text-foreground">{homeGoals}</span>
                <span className="text-xl font-light text-muted-foreground">—</span>
                <span className="text-3xl font-black tabular-nums text-foreground">{awayGoals}</span>
              </div>
              {isLive ? (
                <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-destructive uppercase">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                  {statusTr}
                </span>
              ) : (
                <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {statusTr}
                </span>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-2xl font-bold text-muted-foreground/50">vs</span>
              <span className="text-[10px] font-medium text-muted-foreground">{statusTr}</span>
            </div>
          )}
        </div>

        {/* Away */}
        <TeamButton team={fixture.away} className="flex flex-col items-center gap-2">
          {fixture.away.logo && (
            <img src={fixture.away.logo} alt={fixture.away.name} className="h-14 w-14 object-contain drop-shadow-sm" />
          )}
          <span className="text-center text-sm font-semibold text-foreground text-balance leading-tight hover:text-primary transition-colors">{fixture.away.name}</span>
        </TeamButton>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible wrapper
// ---------------------------------------------------------------------------

function Collapsible({
  header,
  children,
  defaultOpen = false,
}: {
  header: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="shrink-0 rounded-full border border-border p-0.5">
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3.5">
          {children}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode
  title: string
  badge?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status label — Türkçe çeviri + canlı maçlarda dakika
// ---------------------------------------------------------------------------

function translateStatus(short: string, elapsed: number | null, elapsedExtra?: number | null): string {
  const min = typeof elapsed === "number"
    ? (elapsedExtra != null && elapsedExtra > 0 ? `${elapsed}+${elapsedExtra}'` : `${elapsed}'`)
    : null
  switch (short) {
    case "1H": return min ?? "1. Yarı"
    case "2H": return min ?? "2. Yarı"
    case "ET": return min ? `${min} (Uzatma)` : "Uzatma"
    case "HT": return "Devre Arası"
    case "BT": return "Devre Arası"
    case "P":  return "Penaltılar"
    case "LIVE": return min ?? "Canlı"
    case "FT":  return "Maç Sonu"
    case "AET": return "Maç Sonu (Uzatma)"
    case "PEN": return "Maç Sonu (Pen.)"
    case "NS":  return "Başlamadı"
    case "TBD": return "Saat Belirsiz"
    case "PST": return "Ertelendi"
    case "CANC": return "İptal Edildi"
    case "ABD": return "Tatil Edildi"
    case "SUSP": return "Askıya Alındı"
    case "INT": return "Ara Verildi"
    case "AWD": return "Hükmen"
    case "WO":  return "Hükmen"
    default:    return short
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const EVENT_DETAIL_TR: Record<string, string> = {
  "Normal Goal": "Normal Gol",
  "Own Goal": "Kendi Kalesine",
  "Penalty": "Penaltı",
  "Missed Penalty": "Kaçırılan Penaltı",
  "Yellow Card": "Sarı Kart",
  "Red Card": "Kırmızı Kart",
  "Yellow Red Card": "İkinci Sarı Kart",
  "Substitution 1": "Oyuncu Değişikliği",
  "Substitution 2": "Oyuncu Değişikliği",
  "Substitution 3": "Oyuncu Değişikliği",
  "Substitution 4": "Oyuncu Değişikliği",
  "Substitution 5": "Oyuncu Değişikliği",
  "Substitution 6": "Oyuncu Değişikliği",
  "Goal cancelled": "Gol İptal",
  "Penalty confirmed": "Penaltı Onaylandı",
  "Penalty cancelled": "Penaltı İptal",
  "Card upgrade": "Kart Artırımı",
}

function translateDetail(detail: string): string {
  return EVENT_DETAIL_TR[detail] ?? detail
}

function eventIcon(type: string, detail: string): { bg: string; text: string; symbol: string } {
  if (type === "Goal") {
    if (detail === "Own Goal") return { bg: "bg-destructive/10", text: "text-destructive", symbol: "OG" }
    if (detail === "Penalty") return { bg: "bg-primary/10", text: "text-primary", symbol: "P" }
    return { bg: "bg-primary/10", text: "text-primary", symbol: "G" }
  }
  if (type === "Card") {
    if (detail === "Red Card" || detail === "Yellow Red Card") return { bg: "bg-destructive/10", text: "text-destructive", symbol: "K" }
    return { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", symbol: "S" }
  }
  if (type === "subst") return { bg: "bg-secondary", text: "text-muted-foreground", symbol: "↕" }
  return { bg: "bg-secondary", text: "text-muted-foreground", symbol: "•" }
}

function SubstitutionIcon() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        {/* Yeşil yukarı ok — giren oyuncu */}
        <path d="M7 6V2M5 4l2-2 2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-primary" style={{ color: "oklch(0.6 0.15 152)" }} />
        {/* Kırmızı aşağı ok — çıkan oyuncu */}
        <path d="M7 8v4m2-2-2 2-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "oklch(0.58 0.22 25)" }} />
      </svg>
    </span>
  )
}

function EventsList({ events, homeName }: { events: MatchEvent[]; homeName: string }) {
  const sorted = [...events].sort((a, b) => a.minute - b.minute)
  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((ev, i) => {
        const isHome = ev.team === homeName
        const isSubst = ev.type === "subst"
        const { bg, text, symbol } = eventIcon(ev.type, ev.detail)
        const detailTr = translateDetail(ev.detail)
        return (
          <li key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isHome ? "" : "flex-row-reverse"}`}>
            {/* Minute */}
            <span className="w-8 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
              {ev.minute}{ev.extra ? `+${ev.extra}` : ""}&#39;
            </span>

            {/* Icon pill — değişiklik için özel SVG simge */}
            {isSubst ? (
              <SubstitutionIcon />
            ) : (
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${bg} ${text}`}>
                {symbol}
              </span>
            )}

            {/* Details */}
            <div className={`flex min-w-0 flex-1 flex-col ${isHome ? "" : "items-end"}`}>
              {isSubst ? (
                <>
                  {/* Giren oyuncu — yeşil */}
                  {ev.player && (
                    <span className={`flex items-center gap-1 truncate text-xs font-semibold text-foreground ${isHome ? "" : "flex-row-reverse"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      {ev.player}
                    </span>
                  )}
                  {/* Çıkan oyuncu — kırmızı (assist alanında geliyor) */}
                  {ev.assist && (
                    <span className={`flex items-center gap-1 truncate text-xs text-muted-foreground ${isHome ? "" : "flex-row-reverse"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
                      {ev.assist}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="truncate text-xs font-semibold text-foreground">{ev.player ?? detailTr}</span>
                  {ev.assist && (
                    <span className="truncate text-[10px] text-muted-foreground">Asist: {ev.assist}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{detailTr}</span>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

const STAT_TYPE_TR: Record<string, string> = {
  "Shots on Goal": "İsabetli Şut",
  "Shots off Goal": "İsabetsiz Şut",
  "Total Shots": "Toplam Şut",
  "Blocked Shots": "Engellenen Şut",
  "Shots insidebox": "Ceza Sahası İçi Şut",
  "Shots outsidebox": "Ceza Sahası Dışı Şut",
  "Fouls": "Faul",
  "Corner Kicks": "Korner",
  "Offsides": "Ofsayt",
  "Ball Possession": "Top Hakimiyeti",
  "Yellow Cards": "Sarı Kart",
  "Red Cards": "Kırmızı Kart",
  "Goalkeeper Saves": "Kurtarış",
  "Total passes": "Toplam Pas",
  "Passes accurate": "İsabetli Pas",
  "Passes %": "Pas İsabeti",
  "expected_goals": "Beklenen Gol (xG)",
  "Expected Goals": "Beklenen Gol (xG)",
  "goals_prevented": "Kurtarılan Gol",
  "Penalty Kicks": "Penaltı",
}

// Bu istatistik tipleri her iki taraf da null/0 ise gösterilmez
const HIDE_IF_BOTH_EMPTY = new Set(["expected_goals", "Expected Goals", "goals_prevented", "Goals Prevented"])

function translateStat(type: string): string {
  return STAT_TYPE_TR[type] ?? type
}

function StatsList({
  stats,
  homeName,
  awayName,
}: {
  stats: StatItem[]
  homeName: string
  awayName: string
}) {
  const toNum = (v: string | number | null) =>
    typeof v === "string" ? Number.parseFloat(v.replace("%", "")) : (v ?? 0)

  // Her iki taraf da null/boş olan ve HIDE_IF_BOTH_EMPTY setinde olan istatistikleri filtrele
  const visibleStats = stats.filter((s) => {
    if (!HIDE_IF_BOTH_EMPTY.has(s.type)) return true
    const hv = s.home
    const av = s.away
    const bothEmpty =
      (hv === null || hv === "" || hv === 0 || hv === "0") &&
      (av === null || av === "" || av === 0 || av === "0")
    return !bothEmpty
  })

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
        <span className="max-w-[40%] truncate">{homeName}</span>
        <span className="max-w-[40%] truncate text-right">{awayName}</span>
      </div>

      {visibleStats.map((s, i) => {
        const hv = toNum(s.home)
        const av = toNum(s.away)
        const total = hv + av || 1
        const hPct = Math.round((hv / total) * 100)
        const aPct = 100 - hPct
        return (
          <div key={i} className="flex flex-col gap-1.5 py-1.5">
            {/* Values + label */}
            <div className="flex items-center justify-between gap-2">
              <span className="w-10 text-left text-xs font-bold tabular-nums text-foreground">{s.home ?? "—"}</span>
              <span className="flex-1 text-center text-[11px] text-muted-foreground">{translateStat(s.type)}</span>
              <span className="w-10 text-right text-xs font-bold tabular-nums text-foreground">{s.away ?? "—"}</span>
            </div>
            {/* Bar */}
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${hPct}%` }} />
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${aPct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

function LineupsView({ lineups }: { lineups: TeamLineup[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lineups.map((l) => (
        <div key={l.team} className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          {/* Team + formation */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{l.team}</span>
            {l.formation && (
              <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-mono font-semibold text-muted-foreground">
                {l.formation}
              </span>
            )}
          </div>
          {l.coach && (
            <p className="text-[11px] text-muted-foreground">TD: {l.coach}</p>
          )}

          {/* Starting XI */}
          {l.startXI.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">İlk 11</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1">
                {l.startXI.map((p, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-xs">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-bold tabular-nums text-primary">
                      {p.number ?? "—"}
                    </span>
                    <span className="truncate text-foreground">{p.name}</span>
                    {p.pos && (
                      <span className="shrink-0 text-[9px] text-muted-foreground">({p.pos})</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Substitutes */}
          {l.substitutes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Yedekler</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1">
                {l.substitutes.map((p, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-xs">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-secondary text-[9px] tabular-nums text-muted-foreground">
                      {p.number ?? "—"}
                    </span>
                    <span className="truncate text-muted-foreground">{p.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsTable({
  standings,
  homeId,
  awayId,
}: {
  standings: StandingRow[]
  homeId: number
  awayId: number
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[460px] text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2 pl-1 text-left font-semibold text-muted-foreground">#</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">Takım</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground">O</th>
            <th className="pb-2 text-center font-semibold text-primary">G</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground">B</th>
            <th className="pb-2 text-center font-semibold text-destructive">M</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground">AG</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground">YG</th>
            <th className="pb-2 text-center font-semibold text-foreground">P</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">Son 5</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const isHighlighted = row.teamId === homeId || row.teamId === awayId
            return (
              <tr
                key={row.teamId}
                className={`border-b border-border/50 last:border-0 transition-colors ${
                  isHighlighted
                    ? "bg-primary/8 font-semibold"
                    : "hover:bg-secondary/40"
                }`}
              >
                <td className="py-2 pl-1 tabular-nums text-muted-foreground">{row.rank}</td>
                <td className="max-w-[140px] truncate py-2 pr-2 text-foreground">{row.team}</td>
                <td className="py-2 text-center tabular-nums text-muted-foreground">{row.played}</td>
                <td className="py-2 text-center tabular-nums font-semibold text-primary">{row.win}</td>
                <td className="py-2 text-center tabular-nums text-muted-foreground">{row.draw}</td>
                <td className="py-2 text-center tabular-nums text-destructive">{row.lose}</td>
                <td className="py-2 text-center tabular-nums text-foreground">{row.goalsFor}</td>
                <td className="py-2 text-center tabular-nums text-foreground">{row.goalsAgainst}</td>
                <td className="py-2 text-center tabular-nums font-bold text-foreground">{row.points}</td>
                <td className="py-2">
                  {row.form
                    ? <FormBadge form={row.form.slice(-5)} />
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team season stats
// ---------------------------------------------------------------------------

function TeamStatsCard({ stats, label }: { stats: TeamSeasonStats; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <TeamButton team={stats.team} className="flex items-center gap-2">
          {stats.team.logo && (
            <img src={stats.team.logo} alt={stats.team.name} className="h-7 w-7 object-contain" />
          )}
          <span className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{stats.team.name}</span>
        </TeamButton>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>

      {/* Form */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Son Form</span>
        <FormBadge form={stats.formString} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Oynanan" value={stats.played} />
        <StatCell label="Att. Ort." value={stats.goalsForAvg.toFixed(1)} />
        <StatCell label="Yed. Ort." value={stats.goalsAgainstAvg.toFixed(1)} />
        <StatCell label="Galibiyet" value={stats.wins} accent="text-primary" />
        <StatCell label="Beraberlik" value={stats.draws} />
        <StatCell label="Mağlubiyet" value={stats.losses} accent="text-destructive" />
        <StatCell label="Gol Yok" value={stats.cleanSheets} />
        <StatCell label="Skorsuz" value={stats.failedToScore} />
      </div>

      {/* Recent matches */}
      {stats.recent.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Son Maçlar</p>
          <ul className="flex flex-col gap-1">
            {stats.recent.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-1.5 text-xs">
                <span className="shrink-0 tabular-nums text-muted-foreground">{g.date.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate text-center text-foreground">vs {g.opponent}</span>
                <span className="shrink-0 tabular-nums font-bold text-foreground">{g.scored}-{g.conceded}</span>
                <ResultBadge result={g.result} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCell({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border/50 bg-card px-2 py-2 text-center">
      <span className={`text-sm font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</span>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const map = {
    W: { label: "G", cls: "bg-primary/15 text-primary border-primary/20" },
    D: { label: "B", cls: "bg-secondary text-muted-foreground border-border" },
    L: { label: "M", cls: "bg-destructive/15 text-destructive border-destructive/20" },
  }
  const { label, cls } = map[result]
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[9px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// H2H
// ---------------------------------------------------------------------------

function H2HList({
  h2h,
  homeName,
  awayName,
}: {
  h2h: FormGame[]
  homeName: string
  awayName: string
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {h2h.map((g, i) => {
        // Gerçek maç adlarını kullan (varsa), yoksa perspective bazlı fallback
        const displayHome = g.homeTeam ?? (g.home ? homeName : awayName)
        const displayAway = g.awayTeam ?? (g.home ? g.opponent : homeName)
        // Skoru perspektife göre değil, gerçek ev/deplasman bazlı göster
        const homeGoals = g.homeTeam ? (g.home ? g.scored : g.conceded) : g.scored
        const awayGoals = g.homeTeam ? (g.home ? g.conceded : g.scored) : g.conceded
        return (
          <li
            key={i}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5"
          >
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{g.date.slice(0, 10)}</span>
            <span className="min-w-0 flex-1 truncate text-center text-xs text-foreground">
              {displayHome} — {displayAway}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-foreground">{homeGoals}-{awayGoals}</span>
              <ResultBadge result={g.result} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------

function InjuryList({ injuries }: { injuries: InjuryItem[] }) {
  const byTeam = injuries.reduce<Record<string, InjuryItem[]>>((acc, item) => {
    if (!acc[item.team]) acc[item.team] = []
    acc[item.team].push(item)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(byTeam).map(([team, items]) => (
        <div key={team}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-foreground">{team}</p>
          <ul className="flex flex-col gap-1">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-foreground">{item.player}</span>
                <span className="shrink-0 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                  {item.reason || item.type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
