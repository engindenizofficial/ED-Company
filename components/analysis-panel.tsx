"use client"

import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flag,
  Inbox,
  LoaderCircle,
  MapPin,
  RotateCw,
  Shield,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  Fixture,
  FixturePlayerStat,
  FormGame,
  InjuryItem,
  LineupPlayer,
  MatchPrediction,
  ModelVote,
  MatchEvent,
  StatItem,
  StandingRow,
  TeamLineup,
  TeamSeasonStats,
} from "@/lib/types"
import { FormBadge } from "./form-badge"
import { TeamButton } from "./team-panel"
import { PlayerButton } from "./player-panel"
import { PanelTabBar, type PanelTabItem } from "@/components/panel-tabs"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ülke adını bayrak emoji'ye çevirir. ISO 3166-1 alpha-2 koduna göre. */
function countryFlag(country: string): string {
  const CODE_MAP: Record<string, string> = {
    "England": "GB", "Scotland": "GB", "Wales": "GB", "Northern Ireland": "GB",
    "Spain": "ES", "Germany": "DE", "Italy": "IT", "France": "FR",
    "Netherlands": "NL", "Portugal": "PT", "Turkey": "TR", "Belgium": "BE",
    "Greece": "GR", "Russia": "RU", "Austria": "AT", "Switzerland": "CH",
    "Denmark": "DK", "Sweden": "SE", "Norway": "NO", "Poland": "PL",
    "Ukraine": "UA", "Croatia": "HR", "Serbia": "RS", "Czech Republic": "CZ",
    "Czechia": "CZ", "Romania": "RO", "Ireland": "IE", "Hungary": "HU",
    "Slovakia": "SK", "Slovenia": "SI", "Bulgaria": "BG", "Finland": "FI",
    "Iceland": "IS", "Albania": "AL", "Armenia": "AM", "Azerbaijan": "AZ",
    "Belarus": "BY", "Bosnia": "BA", "Bosnia and Herzegovina": "BA",
    "Cyprus": "CY", "Estonia": "EE", "Georgia": "GE", "Kosovo": "XK",
    "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU", "Malta": "MT",
    "Moldova": "MD", "Montenegro": "ME", "North Macedonia": "MK",
    "Brazil": "BR", "Argentina": "AR", "Colombia": "CO", "Chile": "CL",
    "Peru": "PE", "Uruguay": "UY", "Paraguay": "PY", "Ecuador": "EC",
    "USA": "US", "United States": "US", "Mexico": "MX", "Canada": "CA",
    "Japan": "JP", "China": "CN", "South Korea": "KR", "Saudi Arabia": "SA",
    "Iran": "IR", "Iraq": "IQ", "Israel": "IL", "Qatar": "QA",
    "UAE": "AE", "United Arab Emirates": "AE", "Australia": "AU",
    "Nigeria": "NG", "Ghana": "GH", "Egypt": "EG", "Morocco": "MA",
    "Senegal": "SN", "Cameroon": "CM", "South Africa": "ZA",
  }
  const code = CODE_MAP[country] ?? CODE_MAP[country.trim()]
  if (!code) return ""
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AnalysisPanel({
  fixture,
  prediction,
  predictionLoading,
  onPredict,
}: {
  fixture: Fixture
  prediction?: MatchPrediction | null
  predictionLoading?: boolean
  onPredict?: () => void
}) {
  const LIVE_OR_FINISHED = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "FT", "AET", "PEN", "AWD", "WO"])
  const isPredictable = !LIVE_OR_FINISHED.has(fixture.statusShort)
  // Tahmin yapılmışsa maç başlamış/bitmişse de göster
  const hasPrediction = !!(prediction)
  const showPrediction = isPredictable || hasPrediction

  const { home, away, league } = fixture

  // Sekmeler yan yana sıralanır; panel açıldığında ilk sekme (Maç Olayları)
  // otomatik olarak kendi verisini çeker, diğerleri sadece tıklandığında.
  const tabs: PanelTabItem[] = [
    { key: "events", label: "Maç Olayları", icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "playerStats", label: "Oyuncu Performansları", icon: <Star className="h-3.5 w-3.5" /> },
    { key: "statistics", label: "Maç İstatistikleri", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: "lineups", label: "Kadrolar", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "standings", label: "Puan Durumu", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "teamStats", label: "Sezon İstatistikleri", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: "h2h", label: "Karşılıklı Maçlar", icon: <Swords className="h-3.5 w-3.5" /> },
    { key: "injuries", label: "Sakatlık / Ceza", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0].key)

  return (
    <div className="flex flex-col gap-2">
      {/* 1. Match header — panel açıldığında ekstra bir istek yapmadan anında gösterilir */}
      <MatchHeader fixture={fixture} />

      {/* 2. AI Prediction */}
      {showPrediction && (
        <PredictionCard
          prediction={prediction ?? null}
          isLoading={predictionLoading ?? false}
          homeName={home.name}
          awayName={away.name}
          onPredict={isPredictable ? onPredict : undefined}
        />
      )}

      {/* Yan yana sekmeler — ilk sekme otomatik açılır, diğerleri sadece seçilince veri çeker */}
      <PanelTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <EventsSection fixtureId={fixture.id} homeName={home.name} active={activeTab === "events"} />
      <PlayerStatsSection fixtureId={fixture.id} home={home} away={away} active={activeTab === "playerStats"} />
      <StatisticsSection
        fixtureId={fixture.id}
        homeName={home.name}
        awayName={away.name}
        active={activeTab === "statistics"}
      />
      <LineupsSection fixtureId={fixture.id} active={activeTab === "lineups"} />
      <StandingsSection
        fixtureId={fixture.id}
        leagueId={league.id}
        season={league.season}
        homeId={home.id}
        awayId={away.id}
        active={activeTab === "standings"}
      />
      <TeamStatsSection
        fixtureId={fixture.id}
        home={home}
        away={away}
        leagueId={league.id}
        season={league.season}
        active={activeTab === "teamStats"}
      />
      <H2HSection
        fixtureId={fixture.id}
        homeId={home.id}
        awayId={away.id}
        homeName={home.name}
        awayName={away.name}
        active={activeTab === "h2h"}
      />
      <InjuriesSection fixtureId={fixture.id} active={activeTab === "injuries"} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match header
// ---------------------------------------------------------------------------

function MatchHeader({ fixture }: { fixture: Fixture }) {
  const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])
  const isLive = LIVE_STATUSES.has(fixture.statusShort)
  const homeGoals = fixture.goalsHome
  const awayGoals = fixture.goalsAway
  const hasScore = homeGoals != null && awayGoals != null
  const statusTr = translateStatus(fixture.statusShort, fixture.elapsed, fixture.elapsedExtra)

  return (
    <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      {/* League strip */}
      <div className="flex items-center justify-center gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2">
        {fixture.league.logo && (
          <img src={fixture.league.logo} alt="" className="h-4 w-4 object-contain" />
        )}
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
          {fixture.league.name}
          {fixture.league.round ? <span className="font-normal opacity-60"> · {fixture.league.round}</span> : ""}
        </span>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5">
        {/* Home */}
        <TeamButton team={fixture.home} className="flex flex-col items-center gap-2 group">
          {fixture.home.logo && (
            <img src={fixture.home.logo} alt={fixture.home.name} className="h-14 w-14 object-contain drop-shadow-sm transition-transform group-hover:scale-105" />
          )}
          <span className="text-center text-sm font-bold text-foreground text-balance leading-tight group-hover:text-primary transition-colors">{fixture.home.name}</span>
        </TeamButton>

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-2 min-w-[80px]">
          {hasScore ? (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("text-4xl font-black tabular-nums", isLive ? "text-foreground" : homeGoals > awayGoals ? "text-primary" : "text-foreground")}>{homeGoals}</span>
                <span className="text-2xl font-light text-muted-foreground/50">:</span>
                <span className={cn("text-4xl font-black tabular-nums", isLive ? "text-foreground" : awayGoals > homeGoals ? "text-primary" : "text-foreground")}>{awayGoals}</span>
              </div>
              {isLive ? (
                <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-destructive uppercase">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                  {statusTr}
                </span>
              ) : (
                <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {statusTr}
                </span>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-2xl font-bold text-muted-foreground/40">vs</span>
              <span className="text-[11px] font-medium text-muted-foreground">{statusTr}</span>
            </div>
          )}
          {/* Venue */}
          {fixture.venue && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[90px]">{fixture.venue}</span>
            </span>
          )}
          {/* Referee */}
          {fixture.referee && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Flag className="h-2.5 w-2.5 shrink-0" />
              {fixture.refereeCountry && (
                <span aria-label={fixture.refereeCountry}>
                  {countryFlag(fixture.refereeCountry)}
                </span>
              )}
              <span className="truncate max-w-[110px]">{fixture.referee}</span>
            </span>
          )}
        </div>

        {/* Away */}
        <TeamButton team={fixture.away} className="flex flex-col items-center gap-2 group">
          {fixture.away.logo && (
            <img src={fixture.away.logo} alt={fixture.away.name} className="h-14 w-14 object-contain drop-shadow-sm transition-transform group-hover:scale-105" />
          )}
          <span className="text-center text-sm font-bold text-foreground text-balance leading-tight group-hover:text-primary transition-colors">{fixture.away.name}</span>
        </TeamButton>
      </div>
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
    case "FT":  return "MS"
    case "AET": return "MS (Uzatma)"
    case "PEN": return "MS (Pen.)"
    case "NS":  return "Başlamadı"
    case "TBD": return "Saat Belirsiz"
    case "PST": return "Ertelendi"
    case "CANC": return "İptal"
    case "ABD": return "Tatil"
    case "SUSP": return "Askıya Alındı"
    case "INT": return "Ara"
    case "AWD": return "Hükmen"
    case "WO":  return "Hükmen"
    default:    return short
  }
}

// ---------------------------------------------------------------------------
// Sekme verisi çekimi — her sekme yalnızca kendisi açıldığında (open=true)
// kendi endpoint'ini çağırır. Panel açılırken hiçbir sekme verisi çekilmez.
// ---------------------------------------------------------------------------

type SectionStatus = "idle" | "loading" | "success" | "empty" | "error"

interface SectionState<T> {
  status: SectionStatus
  data: T | null
  error: string | null
}

function useLazySection<T>(url: string, open: boolean) {
  const [state, setState] = useState<SectionState<T>>({ status: "idle", data: null, error: null })
  // "hasLoadedRef" isteğin tamamlanıp tamamlanmadığını takip eder. React 18/19
  // geliştirme modunda (Strict Mode) her effect mount->unmount->mount şeklinde
  // iki kez çalışır: ilk çalıştırma başlattığı isteği cleanup'ta iptal eder,
  // ikinci çalıştırma ise gerçek isteği başlatıp tamamlar. Bu yüzden "zaten
  // başladı mı" kontrolünü sonuçlanmamış bir isteğin iptal edilmesine izin
  // verecek şekilde yapıyoruz — aksi halde ikinci (gerçek) mount hiç istek
  // başlatmaz ve arayüz sonsuza kadar "yükleniyor" durumunda kalır.
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!open || hasLoadedRef.current) return
    let cancelled = false
    setState({ status: "loading", data: null, error: null })
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `Sunucu hatası: ${res.status}`)
        }
        return res.json() as Promise<{ data: T | null }>
      })
      .then((json) => {
        if (cancelled) return
        hasLoadedRef.current = true
        setState({ status: json.data === null ? "empty" : "success", data: json.data, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        hasLoadedRef.current = true
        setState({ status: "error", data: null, error: err instanceof Error ? err.message : "Bir hata oluştu" })
      })
    return () => {
      cancelled = true
    }
  }, [open, url])

  const retry = useCallback(() => {
    hasLoadedRef.current = false
    setState({ status: "idle", data: null, error: null })
  }, [])
  return { ...state, retry }
}

function SectionShell({ active, children }: {
  active: boolean
  children: React.ReactNode
}) {
  if (!active) return null
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      {children}
    </section>
  )
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{label} yükleniyor...</p>
    </div>
  )
}

function SectionErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive/70" />
      <p className="text-xs font-bold text-destructive">Veri alınamadı</p>
      {error && <p className="text-[11px] text-muted-foreground">{error}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
      >
        <RotateCw className="h-3 w-3" />
        Tekrar dene
      </button>
    </div>
  )
}

function SectionEmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">Bu maç için {label} bulunamadı.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function EventsSection({ fixtureId, homeName, active }: { fixtureId: number; homeName: string; active: boolean }) {
  const { status, data, error, retry } = useLazySection<MatchEvent[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=events`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Maç olayları" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="maç olayı" />}
      {status === "success" && data && <EventsList events={data} homeName={homeName} />}
    </SectionShell>
  )
}

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
    if (detail === "Penalty") return { bg: "bg-primary/15", text: "text-primary", symbol: "P" }
    return { bg: "bg-primary/15", text: "text-primary", symbol: "G" }
  }
  if (type === "Card") {
    if (detail === "Red Card" || detail === "Yellow Red Card") return { bg: "bg-destructive/10", text: "text-destructive", symbol: "K" }
    return { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400", symbol: "S" }
  }
  if (type === "subst") return { bg: "bg-secondary", text: "text-muted-foreground", symbol: "↕" }
  return { bg: "bg-secondary", text: "text-muted-foreground", symbol: "•" }
}

function SubstitutionIcon() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 6V2M5 4l2-2 2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "oklch(0.6 0.15 152)" }} />
        <path d="M7 8v4m2-2-2 2-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "oklch(0.58 0.22 25)" }} />
      </svg>
    </span>
  )
}

function EventsList({ events, homeName }: { events: MatchEvent[]; homeName: string }) {
  const sorted = [...events].sort((a, b) => a.minute - b.minute)
  return (
    <ul className="flex flex-col gap-0.5">
      {sorted.map((ev, i) => {
        const isHome = ev.team === homeName
        const isSubst = ev.type === "subst"
        const { bg, text, symbol } = eventIcon(ev.type, ev.detail)
        const detailTr = translateDetail(ev.detail)
        return (
          <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isHome ? "" : "flex-row-reverse"}`}>
            <span className="w-8 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
              {ev.minute}{ev.extra ? `+${ev.extra}` : ""}&#39;
            </span>
            {isSubst ? (
              <SubstitutionIcon />
            ) : (
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${bg} ${text}`}>
                {symbol}
              </span>
            )}
            <div className={`flex min-w-0 flex-1 flex-col ${isHome ? "" : "items-end"}`}>
              {isSubst ? (
                <>
                  {ev.player && (
                    <span className={`flex items-center gap-1 truncate text-xs font-semibold text-foreground ${isHome ? "" : "flex-row-reverse"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      {ev.playerId ? (
                        <PlayerButton player={{ id: ev.playerId, name: ev.player, photo: null }} className="truncate hover:text-primary">
                          {ev.player}
                        </PlayerButton>
                      ) : ev.player}
                    </span>
                  )}
                  {ev.assist && (
                    <span className={`flex items-center gap-1 truncate text-xs text-muted-foreground ${isHome ? "" : "flex-row-reverse"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
                      {ev.assistId ? (
                        <PlayerButton player={{ id: ev.assistId, name: ev.assist, photo: null }} className="truncate hover:text-primary">
                          {ev.assist}
                        </PlayerButton>
                      ) : ev.assist}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {ev.player && ev.playerId ? (
                    <PlayerButton player={{ id: ev.playerId, name: ev.player, photo: null }} className="truncate text-xs font-semibold text-foreground hover:text-primary">
                      {ev.player}
                    </PlayerButton>
                  ) : (
                    <span className="truncate text-xs font-semibold text-foreground">{ev.player ?? detailTr}</span>
                  )}
                  {ev.assist && (
                    <span className="truncate text-[10px] text-muted-foreground">
                      Asist:{" "}
                      {ev.assistId ? (
                        <PlayerButton player={{ id: ev.assistId, name: ev.assist, photo: null }} className="hover:text-primary">
                          {ev.assist}
                        </PlayerButton>
                      ) : ev.assist}
                    </span>
                  )}
                  {ev.type !== "Goal" && <span className="text-[10px] text-muted-foreground">{detailTr}</span>}
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
// Player Stats — per-match performance table
// ---------------------------------------------------------------------------

function PlayerStatsSection({
  fixtureId,
  home,
  away,
  active,
}: {
  fixtureId: number
  home: { id: number; name: string; logo: string }
  away: { id: number; name: string; logo: string }
  active: boolean
}) {
  const { status, data, error, retry } = useLazySection<FixturePlayerStat[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=playerStats`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Oyuncu performansları" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="oyuncu performans verisi" />}
      {status === "success" && data && (
        <PlayerStatsTable
          home={{ team: home, players: data.filter((p) => p.teamId === home.id) }}
          away={{ team: away, players: data.filter((p) => p.teamId === away.id) }}
        />
      )}
    </SectionShell>
  )
}

function PlayerStatsTable({
  home,
  away,
}: {
  home: { team: { id: number; name: string; logo: string }; players: FixturePlayerStat[] }
  away: { team: { id: number; name: string; logo: string }; players: FixturePlayerStat[] }
}) {
  const [tab, setTab] = useState<"home" | "away">("home")
  const active = tab === "home" ? home : away
  // Sort: starters first (by minutes desc), then subs
  const sorted = [...active.players].sort((a, b) => {
    if (a.substitute !== b.substitute) return a.substitute ? 1 : -1
    return (b.minutes ?? 0) - (a.minutes ?? 0)
  })

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switcher */}
      <div className="flex rounded-xl border border-border/60 bg-secondary/30 p-1 gap-1">
        {([["home", home], ["away", away]] as const).map(([key, side]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] font-semibold transition-all",
              tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {side.team.logo && <img src={side.team.logo} alt="" className="h-4 w-4 object-contain" />}
            {side.team.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b border-border/60">
              <th className="pb-2 pl-1 text-left font-semibold text-muted-foreground min-w-[130px]">Oyuncu</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9">Dk</th>
              <th className="pb-2 text-center font-semibold text-amber-500 w-9" title="Puan">Pn</th>
              <th className="pb-2 text-center font-semibold text-primary w-9" title="Gol">G</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="Asist">A</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="Şut">Şt</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="İsabetli Şut">İŞ</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="Pas">Ps</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="Dripling">Dr</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title="Müdahale">Md</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-8" title="Kart">Kt</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const rating = p.rating ? parseFloat(p.rating) : null
              const ratingColor = rating == null ? "" : rating >= 8 ? "text-primary font-black" : rating >= 7 ? "text-primary/80 font-bold" : rating >= 6 ? "text-foreground font-semibold" : "text-muted-foreground"
              return (
                <tr
                  key={p.player.id}
                  className={cn(
                    "border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/30",
                    p.substitute && "opacity-70",
                    p.captain && "bg-primary/5"
                  )}
                >
                  <td className="py-2 pl-1">
                    <div className="flex items-center gap-2">
                      {/* Photo */}
                      {p.player.photo ? (
                        <img src={p.player.photo} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-secondary shrink-0 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                          {p.player.number ?? "?"}
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1">
                          <PlayerButton player={{ id: p.player.id, name: p.player.name, photo: p.player.photo }} className="truncate text-xs font-semibold text-foreground hover:text-primary max-w-[90px]">
                            {p.player.name}
                          </PlayerButton>
                          {p.captain && <span className="text-[9px] font-black text-amber-500">©</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {p.player.pos ?? ""}
                          {p.substitute ? " · Yedek" : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.minutes ?? "—"}</td>
                  <td className={`py-2 text-center tabular-nums ${ratingColor}`}>{p.rating ? parseFloat(p.rating).toFixed(1) : "—"}</td>
                  <td className="py-2 text-center tabular-nums font-semibold text-primary">{p.goals ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.assists ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.shots ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.shotsOn ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.passes ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.dribbles ?? "—"}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{p.tackles ?? "—"}</td>
                  <td className="py-2 text-center">
                    {p.redCard ? (
                      <span className="inline-block h-3.5 w-2.5 rounded-sm bg-destructive" title="Kırmızı Kart" />
                    ) : p.yellowCard ? (
                      <span className="inline-block h-3.5 w-2.5 rounded-sm bg-yellow-400" title="Sarı Kart" />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
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

const HIDE_IF_BOTH_EMPTY = new Set(["expected_goals", "Expected Goals", "goals_prevented", "Goals Prevented"])

function translateStat(type: string): string {
  return STAT_TYPE_TR[type] ?? type
}

function StatisticsSection({
  fixtureId,
  homeName,
  awayName,
  active,
}: {
  fixtureId: number
  homeName: string
  awayName: string
  active: boolean
}) {
  const { status, data, error, retry } = useLazySection<StatItem[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=statistics`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Maç istatistikleri" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="maç istatistiği" />}
      {status === "success" && data && <StatsList stats={data} homeName={homeName} awayName={awayName} />}
    </SectionShell>
  )
}

function StatsList({ stats, homeName, awayName }: { stats: StatItem[]; homeName: string; awayName: string }) {
  const toNum = (v: string | number | null) =>
    typeof v === "string" ? Number.parseFloat(v.replace("%", "")) : (v ?? 0)

  const visibleStats = stats.filter((s) => {
    if (!HIDE_IF_BOTH_EMPTY.has(s.type)) return true
    const hv = s.home
    const av = s.away
    return !((hv === null || hv === "" || hv === 0 || hv === "0") && (av === null || av === "" || av === 0 || av === "0"))
  })

  return (
    <div className="flex flex-col gap-0.5">
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
          <div key={i} className="flex flex-col gap-1 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="w-10 text-left text-xs font-bold tabular-nums text-foreground">{s.home ?? "—"}</span>
              <span className="flex-1 text-center text-[11px] text-muted-foreground">{translateStat(s.type)}</span>
              <span className="w-10 text-right text-xs font-bold tabular-nums text-foreground">{s.away ?? "—"}</span>
            </div>
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-secondary">
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
// Lineups — formation grid görselleştirmesi + oyuncu listesi
// ---------------------------------------------------------------------------

function LineupsSection({ fixtureId, active }: { fixtureId: number; active: boolean }) {
  const { status, data, error, retry } = useLazySection<TeamLineup[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=lineups`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Kadrolar" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="kadro" />}
      {status === "success" && data && <LineupsView lineups={data} />}
    </SectionShell>
  )
}

function LineupsView({ lineups }: { lineups: TeamLineup[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lineups.map((l) => (
        <div key={l.team} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
          {/* Team + formation + coach */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-foreground">{l.team}</span>
              {l.coach && (
                <span className="text-[11px] text-muted-foreground">TD: {l.coach}</span>
              )}
            </div>
            {l.formation && (
              <span className="rounded-lg border border-border bg-card px-2 py-0.5 text-[11px] font-mono font-bold text-muted-foreground">
                {l.formation}
              </span>
            )}
          </div>

          {/* Starting XI */}
          {l.startXI.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">İlk 11</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {l.startXI.map((p, idx) => (
                  <PlayerLineupRow key={idx} player={p} isStarter />
                ))}
              </ol>
            </div>
          )}

          {/* Substitutes */}
          {l.substitutes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">Yedekler</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {l.substitutes.map((p, idx) => (
                  <PlayerLineupRow key={idx} player={p} isStarter={false} />
                ))}
              </ol>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PlayerLineupRow({ player, isStarter }: { player: LineupPlayer; isStarter: boolean }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      <span className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold tabular-nums",
        isStarter ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
      )}>
        {player.number ?? "—"}
      </span>
      {player.id ? (
        <PlayerButton player={{ id: player.id, name: player.name, photo: null }} className="truncate text-foreground hover:text-primary">
          {player.name}
        </PlayerButton>
      ) : (
        <span className="truncate text-foreground">{player.name}</span>
      )}
      {player.pos && (
        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground/60">
          {player.pos}
        </span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function StandingsSection({
  fixtureId,
  leagueId,
  season,
  homeId,
  awayId,
  active,
}: {
  fixtureId: number
  leagueId: number
  season: number
  homeId: number
  awayId: number
  active: boolean
}) {
  const { status, data, error, retry } = useLazySection<StandingRow[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=standings&leagueId=${leagueId}&season=${season}&homeId=${homeId}&awayId=${awayId}`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Puan durumu" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="puan durumu" />}
      {status === "success" && data && <StandingsTable standings={data} homeId={homeId} awayId={awayId} />}
    </SectionShell>
  )
}

function StandingsTable({ standings, homeId, awayId }: { standings: StandingRow[]; homeId: number; awayId: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[480px] text-xs">
        <thead>
          <tr className="border-b border-border/60">
            <th className="pb-2 pl-1 text-left font-semibold text-muted-foreground w-6">#</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">Takım</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">O</th>
            <th className="pb-2 text-center font-semibold text-primary w-8">G</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">B</th>
            <th className="pb-2 text-center font-semibold text-destructive w-8">M</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">AG</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">YG</th>
            <th className="pb-2 text-center font-semibold text-foreground w-8">P</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">Son 5</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const isHighlighted = row.teamId === homeId || row.teamId === awayId
            return (
              <tr
                key={row.teamId}
                className={cn(
                  "border-b border-border/40 last:border-0 transition-colors",
                  isHighlighted ? "bg-primary/[0.07] font-semibold" : "hover:bg-secondary/40"
                )}
              >
                <td className="py-2 pl-1 tabular-nums text-muted-foreground">{row.rank}</td>
                <td className="max-w-[130px] truncate py-2 pr-2 text-foreground">{row.team}</td>
                <td className="py-2 text-center tabular-nums text-muted-foreground">{row.played}</td>
                <td className="py-2 text-center tabular-nums font-semibold text-primary">{row.win}</td>
                <td className="py-2 text-center tabular-nums text-muted-foreground">{row.draw}</td>
                <td className="py-2 text-center tabular-nums text-destructive">{row.lose}</td>
                <td className="py-2 text-center tabular-nums text-foreground">{row.goalsFor}</td>
                <td className="py-2 text-center tabular-nums text-foreground">{row.goalsAgainst}</td>
                <td className="py-2 text-center tabular-nums font-black text-foreground">{row.points}</td>
                <td className="py-2">
                  {row.form ? <FormBadge form={row.form.slice(-5)} /> : <span className="text-muted-foreground/40">—</span>}
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

function TeamStatsSection({
  fixtureId,
  home,
  away,
  leagueId,
  season,
  active,
}: {
  fixtureId: number
  home: { id: number; name: string; logo: string }
  away: { id: number; name: string; logo: string }
  leagueId: number
  season: number
  active: boolean
}) {
  const url =
    `/api/analyze/section?fixtureId=${fixtureId}&section=teamStats&leagueId=${leagueId}&season=${season}` +
    `&homeId=${home.id}&homeName=${encodeURIComponent(home.name)}&homeLogo=${encodeURIComponent(home.logo)}` +
    `&awayId=${away.id}&awayName=${encodeURIComponent(away.name)}&awayLogo=${encodeURIComponent(away.logo)}`
  const { status, data, error, retry } = useLazySection<{ homeStats: TeamSeasonStats | null; awayStats: TeamSeasonStats | null }>(url, active)
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Sezon istatistikleri" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="sezon istatistiği" />}
      {status === "success" && data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.homeStats && <TeamStatsCard stats={data.homeStats} label="Ev Sahibi" />}
          {data.awayStats && <TeamStatsCard stats={data.awayStats} label="Deplasman" />}
        </div>
      )}
    </SectionShell>
  )
}

function TeamStatsCard({ stats, label }: { stats: TeamSeasonStats; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <TeamButton team={stats.team} className="flex items-center gap-2 group">
          {stats.team.logo && (
            <img src={stats.team.logo} alt={stats.team.name} className="h-7 w-7 object-contain" />
          )}
          <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{stats.team.name}</span>
        </TeamButton>
        <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Son Form</span>
        <FormBadge form={stats.formString} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <StatCell label="Oynanan" value={stats.played} />
        <StatCell label="Att. Ort." value={stats.goalsForAvg.toFixed(1)} />
        <StatCell label="Yed. Ort." value={stats.goalsAgainstAvg.toFixed(1)} />
        <StatCell label="Galibiyet" value={stats.wins} accent="text-primary" />
        <StatCell label="Beraberlik" value={stats.draws} />
        <StatCell label="Mağlubiyet" value={stats.losses} accent="text-destructive" />
        <StatCell label="Gol Yok" value={stats.cleanSheets} />
        <StatCell label="Skorsuz" value={stats.failedToScore} />
      </div>
      {stats.recent.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">Son Maçlar</p>
          <ul className="flex flex-col gap-1">
            {stats.recent.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card px-2.5 py-1.5 text-xs">
                <span className="shrink-0 tabular-nums text-muted-foreground text-[10px]">{g.date.slice(0, 10)}</span>
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
    <div className="flex flex-col items-center rounded-lg border border-border/40 bg-card px-2 py-2 text-center">
      <span className={`text-sm font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
    </div>
  )
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const map = {
    W: { label: "G", cls: "bg-primary/15 text-primary border-primary/20" },
    D: { label: "B", cls: "bg-secondary text-muted-foreground border-border/60" },
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

function H2HSection({
  fixtureId,
  homeId,
  awayId,
  homeName,
  awayName,
  active,
}: {
  fixtureId: number
  homeId: number
  awayId: number
  homeName: string
  awayName: string
  active: boolean
}) {
  const { status, data, error, retry } = useLazySection<FormGame[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=h2h&homeId=${homeId}&awayId=${awayId}`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Karşılıklı maçlar" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="karşılıklı maç" />}
      {status === "success" && data && (
        <H2HList h2h={data} homeId={homeId} awayId={awayId} homeName={homeName} awayName={awayName} />
      )}
    </SectionShell>
  )
}

function H2HList({
  h2h,
  homeName,
  awayName,
}: {
  h2h: FormGame[]
  homeId: number
  awayId: number
  homeName: string
  awayName: string
}) {
  // Summary: home wins, draws, away wins
  const homeWins = h2h.filter((g) => {
    const isHome = g.homeTeam === homeName || (g.home && !g.homeTeam)
    return isHome ? g.result === "W" : g.result === "L"
  }).length
  const draws = h2h.filter((g) => g.result === "D").length
  const awayWins = h2h.length - homeWins - draws

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold truncate max-w-[35%]">{homeName}</span>
          <span className="text-[10px] text-muted-foreground">{h2h.length} maç</span>
          <span className="text-[11px] font-semibold truncate max-w-[35%] text-right">{awayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-2 rounded-full bg-primary transition-all" style={{ width: `${homeWins / h2h.length * 100}%`, minWidth: homeWins > 0 ? "8px" : "0" }} />
          <div className="flex h-2 rounded-full bg-secondary" style={{ width: `${draws / h2h.length * 100}%`, minWidth: draws > 0 ? "8px" : "0" }} />
          <div className="flex h-2 rounded-full bg-accent transition-all" style={{ width: `${awayWins / h2h.length * 100}%`, minWidth: awayWins > 0 ? "8px" : "0" }} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs font-black text-primary tabular-nums">{homeWins}G</span>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{draws}B</span>
          <span className="text-xs font-black text-accent tabular-nums">{awayWins}G</span>
        </div>
      </div>

      {/* Match list */}
      <ul className="flex flex-col gap-1">
        {h2h.map((g, i) => {
          const displayHome = g.homeTeam ?? (g.home ? homeName : awayName)
          const displayAway = g.awayTeam ?? (g.home ? g.opponent : homeName)
          const homeGoals = g.homeTeam ? (g.home ? g.scored : g.conceded) : g.scored
          const awayGoals = g.homeTeam ? (g.home ? g.conceded : g.scored) : g.conceded
          const homeWon = homeGoals > awayGoals
          const awayWon = awayGoals > homeGoals
          return (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2"
            >
              <span className={cn("truncate text-xs", homeWon ? "font-bold text-foreground" : "text-muted-foreground")}>{displayHome}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] tabular-nums text-muted-foreground/60">{g.date.slice(0, 10)}</span>
                <span className={cn("text-xs font-black tabular-nums", homeWon ? "text-primary" : "text-foreground")}>{homeGoals}</span>
                <span className="text-muted-foreground/40 text-xs">-</span>
                <span className={cn("text-xs font-black tabular-nums", awayWon ? "text-accent" : "text-foreground")}>{awayGoals}</span>
              </div>
              <span className={cn("truncate text-xs text-right", awayWon ? "font-bold text-foreground" : "text-muted-foreground")}>{displayAway}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------

const INJURY_TYPE_TR: Record<string, string> = {
  "Missing Fixture": "Maçta Yok",
  "Questionable": "Şüpheli",
  "Out": "Dışarıda",
}

function InjuriesSection({ fixtureId, active }: { fixtureId: number; active: boolean }) {
  const { status, data, error, retry } = useLazySection<InjuryItem[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=injuries`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label="Sakatlık / ceza bilgisi" />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label="sakatlık / ceza kaydı" />}
      {status === "success" && data && <InjuryList injuries={data} />}
    </SectionShell>
  )
}

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
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">{team}</p>
          <ul className="flex flex-col gap-1">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.playerId ? (
                    <PlayerButton player={{ id: item.playerId, name: item.player, photo: null }} className="truncate font-semibold text-foreground hover:text-primary">
                      {item.player}
                    </PlayerButton>
                  ) : (
                    <span className="truncate font-semibold text-foreground">{item.player}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.type && (
                    <span className="rounded-full border border-border/60 bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {INJURY_TYPE_TR[item.type] ?? item.type}
                    </span>
                  )}
                  {item.reason && (
                    <span className="rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                      {item.reason}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PredictionCard — AI tahmin kartı (ensemble)
// ---------------------------------------------------------------------------

/** Model adını kısa etiket + renk sınıfına çevirir */
function modelLabel(modelId: string): { short: string; colorCls: string } {
  if (modelId.startsWith("openai/"))     return { short: "GPT-5.6 Terra",   colorCls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400" }
  if (modelId.startsWith("anthropic/")) return { short: "Claude",     colorCls: "bg-orange-500/10  text-orange-600  border-orange-500/20  dark:text-orange-400"  }
  if (modelId.startsWith("google/"))    return { short: "Gemini 3.6 Flash", colorCls: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400" }
  if (modelId.startsWith("xai/"))       return { short: "Grok 4.5",   colorCls: "bg-violet-500/10  text-violet-600  border-violet-500/20  dark:text-violet-400"  }
  return { short: modelId.split("/")[0], colorCls: "bg-secondary text-muted-foreground border-border/60" }
}

function ModelVoteRow({
  vote,
  homeName,
  awayName,
}: {
  vote: ModelVote
  homeName: string
  awayName: string
}) {
  const { short, colorCls } = modelLabel(vote.model)
  const winnerLabel =
    vote.winner === "home" ? homeName : vote.winner === "away" ? awayName : "Beraberlik"

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2">
      {/* Model chip */}
      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", colorCls)}>
        {short}
      </span>

      {/* Tahmini skor */}
      <span className="tabular-nums text-xs font-black text-foreground">
        {vote.homeScore} – {vote.awayScore}
      </span>

      {/* Kazanan */}
      <span className="min-w-0 truncate text-xs text-foreground font-semibold">{winnerLabel}</span>

      {/* BTTS + O/U */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className={cn(
          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
          vote.btts
            ? "border-primary/25 bg-primary/8 text-primary"
            : "border-border/60 bg-secondary/60 text-muted-foreground",
        )}>
          {vote.btts ? "KG Var" : "KG Yok"}
        </span>
        <span className={cn(
          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
          vote.overUnder === "over"
            ? "border-primary/25 bg-primary/8 text-primary"
            : "border-border/60 bg-secondary/60 text-muted-foreground",
        )}>
          {vote.overUnder === "over" ? "2.5 Üst" : "2.5 Alt"}
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
          %{vote.confidence}
        </span>
      </div>
    </div>
  )
}

function PredictionCard({
  prediction,
  isLoading,
  homeName,
  awayName,
  onPredict,
}: {
  prediction: MatchPrediction | null
  isLoading: boolean
  homeName: string
  awayName: string
  onPredict?: () => void
}) {
  const [showVotes, setShowVotes] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <div>
          <p className="text-xs font-semibold text-foreground">AI tahminleri hazırlanıyor...</p>
          <p className="text-[11px] text-muted-foreground">
            GPT-5.6 Terra, Gemini 3.6 Flash ve Grok 4.5 paralel olarak analiz yapıyor
          </p>
        </div>
      </div>
    )
  }

  if (!prediction) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">AI Ensemble Tahmini</p>
            <p className="text-[11px] text-muted-foreground">GPT-5.6 Terra · Gemini 3.6 Flash · Grok 4.5</p>
          </div>
        </div>
        {onPredict && (
          <button
            type="button"
            onClick={onPredict}
            className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95"
          >
            Tahmin Al
          </button>
        )}
      </div>
    )
  }

  const winnerLabel =
    prediction.winner === "home"
      ? `${homeName} kazanır`
      : prediction.winner === "away"
        ? `${awayName} kazanır`
        : "Beraberlik"

  const confidenceColor =
    prediction.confidence >= 70
      ? "text-primary"
      : prediction.confidence >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-muted-foreground"

  const modelCount = prediction.modelVotes?.length ?? 0

  return (
    <div className="rounded-2xl border border-primary/25 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-primary/5 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">AI Ensemble Tahmini</span>
        {modelCount > 0 && (
          <span className="rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-bold text-primary">
            {modelCount} model
          </span>
        )}
        <span className="ml-auto rounded-full border border-border/60 bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Gün sonuna kadar geçerli
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        {/* Skor + kazanan */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Ağırlıklı Tahmini Skor
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black tabular-nums text-foreground">{prediction.homeScore}</span>
              <span className="text-xl font-light text-muted-foreground/50">:</span>
              <span className="text-3xl font-black tabular-nums text-foreground">{prediction.awayScore}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
              {winnerLabel}
            </span>
            <span className={`text-[11px] font-semibold tabular-nums ${confidenceColor}`}>
              %{prediction.confidence} güven
            </span>
          </div>
        </div>

        {/* Ek tahminler */}
        <div className="flex flex-wrap gap-2">
          <span className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            prediction.btts
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/60 bg-secondary text-muted-foreground",
          )}>
            {prediction.btts ? "İki takım da atar" : "Tek taraflı gol"}
          </span>
          <span className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            prediction.overUnder === "over"
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/60 bg-secondary text-muted-foreground",
          )}>
            {prediction.overUnder === "over" ? "2.5 Üstü" : "2.5 Altı"}
          </span>
        </div>

        {/* Özet */}
        <p className="text-xs leading-relaxed text-muted-foreground">{prediction.summary}</p>

        {/* Anahtar faktörler */}
        {prediction.keyFactors.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {prediction.keyFactors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {factor}
              </li>
            ))}
          </ul>
        )}

        {/* Model oyları akordeonu */}
        {modelCount > 0 && (
          <div className="border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => setShowVotes((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Model tahminlerini göster ({modelCount} model)</span>
              {showVotes ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showVotes && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {prediction.modelVotes.map((vote, i) => (
                  <ModelVoteRow
                    key={i}
                    vote={vote}
                    homeName={homeName}
                    awayName={awayName}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
