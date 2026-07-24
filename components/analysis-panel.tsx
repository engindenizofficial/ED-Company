"use client"

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flag,
  LoaderCircle,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import type { AnalysisResponse, FixturePlayerStat, FormGame, InjuryItem, MatchEvent, StatItem, StandingRow, TeamLineup, TeamSeasonStats } from "@/lib/types"
import { FormBadge } from "./form-badge"
import { GeminiBadge, GeminiLogo } from "./gemini-logo"
import { ProbabilityBar } from "./probability-bar"

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
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertCircle className="h-7 w-7 text-destructive" />
        <p className="font-semibold text-destructive">Analiz yapılamadı</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <GeminiLogo className="h-5 w-5" />
        </div>
        <p className="max-w-xs text-balance text-sm">
          Gemini bu maç için skor tahmini, kazanma yüzdeleri ve detaylı analiz hazırlıyor.
        </p>
      </div>
    )
  }

  const { live, prediction, playerStats } = data
  const { fixture } = live

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Gemini headline prediction                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="rounded-xl border border-border bg-card p-5">
      {!prediction && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
          <span>Gemini tahmini sıra bekliyor, kısa süre içinde hazır olacak.</span>
        </div>
      )}
        {/* League header */}
        <div className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          {fixture.league.logo ? (
            <img src={fixture.league.logo} alt="" className="h-4 w-4 object-contain" />
          ) : null}
          <span>
            {fixture.league.name}
            {fixture.league.round ? ` · ${fixture.league.round}` : ""}
          </span>
        </div>

        {/* Teams + predicted score */}
        <div className="grid grid-cols-3 items-center gap-2">
          <TeamHeader name={fixture.home.name} logo={fixture.home.logo} />
          <div className="flex flex-col items-center gap-1.5">
            {prediction ? (
              <>
                <div className="flex items-center gap-2 text-3xl font-bold tabular-nums text-foreground">
                  <span>{prediction.score.home}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{prediction.score.away}</span>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tahmini skor
                </span>
                <div className="flex items-center gap-1">
                  <GeminiBadge />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Bekleniyor</span>
              </div>
            )}
          </div>
          <TeamHeader name={fixture.away.name} logo={fixture.away.logo} />
        </div>

        {/* HT + winner + confidence row — only when prediction is ready */}
        {prediction && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">İlk Yarı</span>
              <span className="text-base font-bold tabular-nums text-foreground">
                {prediction.halfTimeScore.home}-{prediction.halfTimeScore.away}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Öngörülen</span>
              <span className="text-sm font-semibold text-foreground">
                {prediction.winner === "home"
                  ? fixture.home.name
                  : prediction.winner === "away"
                    ? fixture.away.name
                    : "Beraberlik"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Güven</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${prediction.confidence}%` }} />
                </div>
                <span className="text-sm font-bold tabular-nums text-primary">%{prediction.confidence}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Gemini outcome probabilities                                   */}
      {/* ---------------------------------------------------------------- */}
      {prediction && (
        <Collapsible
          defaultOpen={false}
          header={<SectionHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title="Kazanma Olasılıkları" gemini />}
        >
          <ProbabilityBar
            homeName={fixture.home.name}
            awayName={fixture.away.name}
            homePct={prediction.homeWinPct}
            drawPct={prediction.drawPct}
            awayPct={prediction.awayWinPct}
          />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. Gemini goal markets                                            */}
      {/* ---------------------------------------------------------------- */}
      {prediction && (
        <Collapsible
          defaultOpen={false}
          header={<SectionHeader icon={<Target className="h-3.5 w-3.5" />} title="Gol Marketleri" gemini />}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MarketCard
              label="Beklenen Gol"
              sub={fixture.home.name}
              value={prediction.expectedGoalsHome.toFixed(2)}
              gemini
            />
            <MarketCard
              label="Beklenen Gol"
              sub={fixture.away.name}
              value={prediction.expectedGoalsAway.toFixed(2)}
              gemini
            />
            <MarketCard label="2.5 Üst" value={`%${prediction.over25Pct}`} sub={`Alt %${prediction.under25Pct}`} gemini />
            <MarketCard label="KG Var" value={`%${prediction.bttsPct}`} sub="Her iki takım gol" gemini />
          </div>
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. Gemini corner / card estimates + first scorer                  */}
      {/* ---------------------------------------------------------------- */}
      {prediction && (
        <Collapsible
          defaultOpen={false}
          header={<SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Korner, Kart & İlk Gol" gemini />}
        >
          <div className="grid grid-cols-3 gap-3">
            <MiniCard
              icon={<Flag className="h-3.5 w-3.5" />}
              label="Korner Tahmini"
              value={prediction.cornersEstimate}
              gemini
            />
            <MiniCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Kart Tahmini"
              value={prediction.cardsEstimate}
              gemini
            />
            <MiniCard
              icon={<Zap className="h-3.5 w-3.5" />}
              label="İlk Gol"
              value={
                prediction.firstToScore === "home"
                  ? fixture.home.name
                  : prediction.firstToScore === "away"
                    ? fixture.away.name
                    : "Belirsiz"
              }
              gemini
            />
          </div>
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. Gemini key factors + analysis                                  */}
      {/* ---------------------------------------------------------------- */}
      {prediction && (
        <Collapsible
          defaultOpen={false}
          header={<SectionHeader icon={<GeminiLogo className="h-3.5 w-3.5" />} title="Gemini Analiz Raporu" />}
        >
          {prediction.keyFactors.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {prediction.keyFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {f}
                </li>
              ))}
            </ul>
          )}

          {prediction.analysis.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              {prediction.analysis.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground/80">
                  {line}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <GeminiBadge label={prediction.model || "Gemini"} />
            <span>
              {new Date(prediction.generatedAt).toLocaleString("tr-TR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. Live events (if any)                                           */}
      {/* ---------------------------------------------------------------- */}
      {live.events.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<Activity className="h-3.5 w-3.5" />}
              title={`Maç Olayları (${live.events.length})`}
            />
          }
        >
          <EventsList events={live.events} homeName={fixture.home.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 7. Match statistics (if any)                                      */}
      {/* ---------------------------------------------------------------- */}
      {live.statistics.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              title="Maç İstatistikleri"
              sub="API-Football"
            />
          }
        >
          <StatsList stats={live.statistics} homeName={fixture.home.name} awayName={fixture.away.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 8. Lineups                                                        */}
      {/* ---------------------------------------------------------------- */}
      {live.lineups.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" />}
              title="İlk 11"
              sub="API-Football"
            />
          }
        >
          <LineupsView lineups={live.lineups} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 8b. Player match stats                                            */}
      {/* ---------------------------------------------------------------- */}
      {playerStats && playerStats.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" />}
              title="Oyuncu Maç İstatistikleri"
              sub="API-Football"
            />
          }
        >
          <PlayerMatchStats
            stats={playerStats}
            homeName={fixture.home.name}
            awayName={fixture.away.name}
            leagueId={fixture.league.id}
          />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 9. Standings                                                      */}
      {/* ---------------------------------------------------------------- */}
      {live.standings.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<Shield className="h-3.5 w-3.5" />}
              title="Puan Durumu"
              sub="API-Football"
            />
          }
        >
          <StandingsTable
            standings={live.standings}
            homeId={fixture.home.id}
            awayId={fixture.away.id}
          />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 10. Team season stats                                             */}
      {/* ---------------------------------------------------------------- */}
      {(live.homeStats || live.awayStats) && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              title="Sezon İstatistikleri & Form"
              sub="API-Football"
            />
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {live.homeStats && <TeamStatsCard stats={live.homeStats} label="Ev Sahibi" />}
            {live.awayStats && <TeamStatsCard stats={live.awayStats} label="Deplasman" />}
          </div>
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 11. H2H                                                           */}
      {/* ---------------------------------------------------------------- */}
      {live.h2h.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<Swords className="h-3.5 w-3.5" />}
              title="Karşılıklı Son Maçlar"
              sub="API-Football"
            />
          }
        >
          <H2HList h2h={live.h2h} homeName={fixture.home.name} awayName={fixture.away.name} />
        </Collapsible>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 12. Injuries                                                      */}
      {/* ---------------------------------------------------------------- */}
      {live.injuries.length > 0 && (
        <Collapsible
          defaultOpen={false}
          header={
            <SectionHeader
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              title={`Sakatlık / Ceza Raporu (${live.injuries.length})`}
              sub="API-Football"
            />
          }
        >
          <InjuryList injuries={live.injuries} />
        </Collapsible>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        Tahminler Gemini tarafından istatistiksel analiz ile üretilmiştir ve yatırım/bahis tavsiyesi değildir.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

const ANALYZING_STEPS = [
  "API-Football Pro verisi çekiliyor...",
  "Form ve istatistikler işleniyor...",
  "Gemini analizi yapılıyor...",
  "Tahmin kilitleniyor...",
]

function AnalyzingState() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 py-6 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <LoaderCircle className="h-14 w-14 animate-spin text-primary" strokeWidth={1.5} />
        <GeminiLogo className="absolute h-5 w-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">Gemini analiz ediyor</p>
        <p className="text-xs text-muted-foreground">{ANALYZING_STEPS[1]}</p>
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
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>{header}</div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  sub,
  gemini = false,
}: {
  icon: React.ReactNode
  title: string
  sub?: string
  gemini?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {sub && !gemini && (
        <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {sub}
        </span>
      )}
      {gemini && <GeminiBadge />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team header
// ---------------------------------------------------------------------------

function TeamHeader({ name, logo }: { name: string; logo: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {logo ? (
        <img src={logo} alt={name} className="h-12 w-12 object-contain" />
      ) : null}
      <span className="text-balance text-sm font-semibold text-foreground">{name}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Market cards
// ---------------------------------------------------------------------------

function MarketCard({
  label,
  sub,
  value,
  gemini = false,
}: {
  label: string
  sub?: string
  value: string | number
  gemini?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {gemini && <GeminiLogo className="h-3 w-3 shrink-0" />}
      </div>
      <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
      {sub && <span className="truncate text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

function MiniCard({
  icon,
  label,
  value,
  gemini = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  gemini?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {icon}
          {label}
        </span>
        {gemini && <GeminiLogo className="h-3 w-3 shrink-0" />}
      </div>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<string, string> = {
  Goal: "⚽",
  Card: "🟨",
  subst: "🔄",
  Var: "📺",
}

const EVENT_TYPE_TR: Record<string, string> = {
  Goal: "Gol",
  Card: "Kart",
  subst: "Oyuncu Değişikliği",
  Var: "VAR",
}

const EVENT_DETAIL_TR: Record<string, string> = {
  // Goals
  "Normal Goal": "Normal Gol",
  "Own Goal": "Kendi Kalesine",
  "Penalty": "Penaltı",
  "Missed Penalty": "Kaçırılan Penaltı",
  // Cards
  "Yellow Card": "Sarı Kart",
  "Red Card": "Kırmızı Kart",
  "Yellow Red Card": "İkinci Sarı Kart",
  // Substitutions
  "Substitution 1": "Değişiklik",
  "Substitution 2": "Değişiklik",
  "Substitution 3": "Değişiklik",
  "Substitution 4": "Değişiklik",
  "Substitution 5": "Değişiklik",
  "Substitution 6": "Değişiklik",
  // VAR
  "Goal cancelled": "Gol İptal",
  "Penalty confirmed": "Penaltı Onaylandı",
  "Penalty cancelled": "Penaltı İptal",
  "Card upgrade": "Kart Artırımı",
}

function translateDetail(detail: string): string {
  return EVENT_DETAIL_TR[detail] ?? detail
}

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
  "Penalty Kicks": "Penaltı",
}

function translateStat(type: string): string {
  return STAT_TYPE_TR[type] ?? type
}

function EventsList({ events, homeName }: { events: MatchEvent[]; homeName: string }) {
  const sorted = [...events].sort((a, b) => a.minute - b.minute)
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((ev, i) => {
        const isHome = ev.team === homeName
        const icon = EVENT_ICONS[ev.type] ?? "•"
        const typeTr = EVENT_TYPE_TR[ev.type] ?? ev.type
        const detailTr = translateDetail(ev.detail)
        return (
          <li
            key={i}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              isHome ? "bg-secondary" : "bg-secondary/50 flex-row-reverse text-right"
            }`}
          >
            <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
              {ev.minute}&apos;{ev.extra ? `+${ev.extra}` : ""}
            </span>
            <span>{icon}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{ev.player ?? typeTr}</span>
              {ev.assist && <span className="truncate text-[11px] text-muted-foreground">Asist: {ev.assist}</span>}
              <span className="text-[10px] text-muted-foreground">{detailTr}</span>
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

  return (
    <div className="flex flex-col gap-3">
      {/* Labels */}
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{homeName}</span>
        <span className="truncate text-right">{awayName}</span>
      </div>
      {stats.map((s, i) => {
        const hv = toNum(s.home)
        const av = toNum(s.away)
        const total = hv + av || 1
        const hPct = Math.round((hv / total) * 100)
        const aPct = 100 - hPct
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold tabular-nums text-foreground">
                {s.home ?? "—"}
              </span>
              <span className="text-muted-foreground">{translateStat(s.type)}</span>
              <span className="font-bold tabular-nums text-foreground">
                {s.away ?? "—"}
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary" style={{ width: `${hPct}%` }} />
              <div className="h-full bg-accent" style={{ width: `${aPct}%` }} />
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
        <div key={l.team} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{l.team}</span>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              {l.formation ?? "—"}
            </span>
          </div>
          {l.coach && (
            <p className="text-[11px] text-muted-foreground">
              Teknik Direktör: {l.coach}
            </p>
          )}
          {l.startXI.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">İlk 11</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1">
                {l.startXI.map((p, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
                      {p.number ?? "—"}
                    </span>
                    {p.id ? (
                      <Link href={`/player/${p.id}`} className="truncate hover:underline hover:text-primary">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="truncate">{p.name}</span>
                    )}
                    {p.pos && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">({p.pos})</span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {l.substitutes.length > 0 && (
            <>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Yedekler
              </p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1">
                {l.substitutes.map((p, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-4 shrink-0 text-right tabular-nums">{p.number ?? "—"}</span>
                    {p.id ? (
                      <Link href={`/player/${p.id}`} className="truncate hover:underline hover:text-primary">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="truncate">{p.name}</span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player match stats
// ---------------------------------------------------------------------------

const POS_TR: Record<string, string> = {
  G: "K",
  D: "D",
  M: "O",
  F: "H",
  Goalkeeper: "Kaleci",
  Defender: "Defans",
  Midfielder: "Orta Saha",
  Attacker: "Forvet",
}

function PlayerMatchStats({
  stats,
  homeName,
  awayName,
  leagueId,
}: {
  stats: FixturePlayerStat[]
  homeName: string
  awayName: string
  leagueId: number
}) {
  const homeStats = stats.filter((s) => s.team === homeName)
  const awayStats = stats.filter((s) => s.team === awayName)

  const TeamBlock = ({ players, label }: { players: FixturePlayerStat[]; label: string }) => (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[460px] text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-1.5 text-left font-medium">Oyuncu</th>
              <th className="pb-1.5 text-center font-medium">Süre</th>
              <th className="pb-1.5 text-center font-medium">Puan</th>
              <th className="pb-1.5 text-center font-medium">Gol</th>
              <th className="pb-1.5 text-center font-medium">Asist</th>
              <th className="pb-1.5 text-center font-medium">Şut</th>
              <th className="pb-1.5 text-center font-medium">Pas</th>
              <th className="pb-1.5 text-center font-medium">Kart</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const rating = p.rating ? Number.parseFloat(p.rating) : null
              const ratingColor =
                rating === null ? "" : rating >= 7.5 ? "text-primary font-bold" : rating < 6 ? "text-destructive" : "text-foreground"
              return (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      {p.player.photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.player.photo} alt="" className="h-5 w-5 rounded-full object-cover" />
                      )}
                      <div className="flex flex-col">
                        <Link
                          href={`/player/${p.player.id}`}
                          className="font-medium text-foreground hover:underline hover:text-primary"
                        >
                          {p.player.name}
                        </Link>
                        <span className="text-[10px] text-muted-foreground">
                          {p.player.pos ? (POS_TR[p.player.pos] ?? p.player.pos) : ""}
                          {p.captain ? " · Kaptan" : ""}
                          {p.substitute ? " · Yedek" : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-1.5 text-center tabular-nums text-muted-foreground">{p.minutes ?? "—"}</td>
                  <td className={`py-1.5 text-center tabular-nums ${ratingColor}`}>{p.rating ?? "—"}</td>
                  <td className="py-1.5 text-center tabular-nums text-foreground">{p.goals ?? "—"}</td>
                  <td className="py-1.5 text-center tabular-nums text-foreground">{p.assists ?? "—"}</td>
                  <td className="py-1.5 text-center tabular-nums text-muted-foreground">
                    {p.shotsOn ?? "—"}/{p.shots ?? "—"}
                  </td>
                  <td className="py-1.5 text-center tabular-nums text-muted-foreground">
                    {p.passes ?? "—"}
                    {p.passesAccuracy ? ` (${p.passesAccuracy}%)` : ""}
                  </td>
                  <td className="py-1.5 text-center">
                    {p.yellowCard && <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400" title="Sarı kart" />}
                    {p.redCard && <span className="inline-block h-3 w-2 rounded-sm bg-red-500 ml-0.5" title="Kırmızı kart" />}
                    {!p.yellowCard && !p.redCard && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {homeStats.length > 0 && <TeamBlock players={homeStats} label={homeName} />}
      {awayStats.length > 0 && <TeamBlock players={awayStats} label={awayName} />}
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
          <tr className="text-muted-foreground">
            <th className="pb-2 text-left font-medium">#</th>
            <th className="pb-2 text-left font-medium">Takım</th>
            <th className="pb-2 text-center font-medium">O</th>
            <th className="pb-2 text-center font-medium">G</th>
            <th className="pb-2 text-center font-medium">B</th>
            <th className="pb-2 text-center font-medium">M</th>
            <th className="pb-2 text-center font-medium">AG</th>
            <th className="pb-2 text-center font-medium">YG</th>
            <th className="pb-2 text-center font-medium">P</th>
            <th className="pb-2 text-left font-medium">Son 5</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const isHighlighted = row.teamId === homeId || row.teamId === awayId
            return (
              <tr
                key={row.teamId}
                className={`border-t border-border ${
                  isHighlighted ? "bg-primary/10 font-semibold" : ""
                }`}
              >
                <td className="py-1.5 text-muted-foreground">{row.rank}</td>
                <td className="py-1.5 max-w-[140px] truncate pr-2 text-foreground">{row.team}</td>
                <td className="py-1.5 text-center tabular-nums text-muted-foreground">{row.played}</td>
                <td className="py-1.5 text-center tabular-nums text-primary">{row.win}</td>
                <td className="py-1.5 text-center tabular-nums text-muted-foreground">{row.draw}</td>
                <td className="py-1.5 text-center tabular-nums text-destructive">{row.lose}</td>
                <td className="py-1.5 text-center tabular-nums text-foreground">{row.goalsFor}</td>
                <td className="py-1.5 text-center tabular-nums text-foreground">{row.goalsAgainst}</td>
                <td className="py-1.5 text-center tabular-nums font-bold text-foreground">{row.points}</td>
                <td className="py-1.5">
                  {row.form ? <FormBadge form={row.form.slice(-5)} /> : <span className="text-muted-foreground">—</span>}
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
    <div className="flex flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <FormBadge form={stats.formString} />
      </div>
      <div className="flex items-center gap-2">
        {stats.team.logo && (
          <img src={stats.team.logo} alt={stats.team.name} className="h-7 w-7 object-contain" />
        )}
        <span className="text-sm font-semibold text-foreground">{stats.team.name}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <StatDl label="Oynanan" value={stats.played} />
        <StatDl label="Att. Ort." value={stats.goalsForAvg.toFixed(1)} />
        <StatDl label="Yed. Ort." value={stats.goalsAgainstAvg.toFixed(1)} />
        <StatDl label="Galibiyet" value={stats.wins} accent="text-primary" />
        <StatDl label="Beraberlik" value={stats.draws} />
        <StatDl label="Mağlubiyet" value={stats.losses} accent="text-destructive" />
        <StatDl label="Klinsmann" value={stats.cleanSheets} />
        <StatDl label="Gol Yok" value={stats.failedToScore} />
      </dl>
      {stats.recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Son Maçlar
          </p>
          <ul className="flex flex-col gap-1">
            {stats.recent.map((g, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{g.date.slice(0, 10)}</span>
                <span className="truncate px-1 text-foreground">vs {g.opponent}</span>
                <span className="tabular-nums font-bold text-foreground">
                  {g.scored}-{g.conceded}
                </span>
                <ResultBadge result={g.result} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatDl({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</dd>
    </div>
  )
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const map = {
    W: { label: "G", cls: "bg-primary text-primary-foreground" },
    D: { label: "B", cls: "bg-muted text-muted-foreground" },
    L: { label: "M", cls: "bg-destructive text-primary-foreground" },
  }
  const { label, cls } = map[result]
  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${cls}`}>
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
    <ul className="flex flex-col gap-2">
      {h2h.map((g, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"
        >
          <span className="text-[11px] text-muted-foreground">{g.date.slice(0, 10)}</span>
          <span className="text-xs text-muted-foreground">
            {g.home ? homeName : awayName} vs {g.opponent}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold tabular-nums text-foreground">
              {g.scored}-{g.conceded}
            </span>
            <ResultBadge result={g.result} />
          </div>
        </li>
      ))}
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
          <p className="mb-2 text-xs font-semibold text-foreground">{team}</p>
          <ul className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-start justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
              >
                <span className="font-medium text-foreground">{item.player}</span>
                <span className="text-right text-muted-foreground">{item.reason || item.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
