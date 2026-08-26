"use client"

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flag,
  Inbox,
  LoaderCircle,
  MapPin,
  Percent,
  RotateCw,
  Shield,
  Sparkles,
  Star,
  Swords,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { MatchButton } from "@/components/match-panel"
import { useGoalCelebrationQueue } from "@/hooks/use-goal-celebration-queue"
import { PlayerPhoto } from "@/components/player-photo"

// "motion" kütüphanesini ana paketten çıkarmak için gol kutlaması talep
// üzerine yükleniyor. Bkz. components/goal-celebration-lazy.tsx.
const GoalCelebrationLazy = dynamic(
  () => import("@/components/goal-celebration-lazy").then((m) => m.GoalCelebrationLazy),
  { ssr: false },
)
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
  TeamInfo,
  TeamLineup,
  TeamSeasonStats,
} from "@/lib/types"
import { FormBadge } from "./form-badge"
import { TeamButton } from "./team-panel"
import { PlayerButton } from "./player-panel"
import { PanelTabBar, type PanelTabItem } from "@/components/panel-tabs"
import { MatchVoteBar } from "@/components/match-vote-bar"
import { MatchShareActions } from "@/components/match-share-actions"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"
import { translateApiError } from "@/lib/i18n/api-error"

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
  isAdmin,
  onDeletePrediction,
}: {
  fixture: Fixture
  prediction?: MatchPrediction | null
  predictionLoading?: boolean
  onPredict?: () => void
  /** Sadece admin hesabında true — tahmini silme butonunu gösterir. */
  isAdmin?: boolean
  /** Admin, tahmini silme onayını verdiğinde çağrılır. */
  onDeletePrediction?: () => Promise<void> | void
}) {
  const LIVE_OR_FINISHED = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "FT", "AET", "PEN", "AWD", "WO"])
  const isPredictable = !LIVE_OR_FINISHED.has(fixture.statusShort)
  // Tahmin yapılmışsa maç başlamış/bitmişse de göster
  const hasPrediction = !!(prediction)
  // Yapay zeka tahmin bölümü şu anlık sadece adminlerde gözükür. Bir admin
  // zaten tahmin almışsa, o tahmin sonucu normal kullanıcılara da gösterilir
  // (ama "Tahmin Al" / silme butonları yalnızca adminde kalır).
  const showPrediction = isAdmin ? isPredictable || hasPrediction : hasPrediction

  // Maç Olayları, Oyuncu Performansları ve Maç İstatistikleri sadece maç
  // başladıktan sonra üretilen verilerdir. Henüz başlamamış bir maçta bu
  // sekmeler boş/anlamsız içerik gösterdiği için hiç listelenmemeli.
  const hasStarted = LIVE_OR_FINISHED.has(fixture.statusShort)

  const { home, away, league } = fixture
  const { t } = useLanguage()

  // Sekmeler yan yana sıralanır; panel açıldığında ilk sekme otomatik
  // kendi verisini çeker, diğerleri sadece tıklandığında. "Oranlar" sekmesi
  // AI tahmininden tamamen bağımsızdır — tahmin alınmamış/silinmiş olsa da
  // kullanıcı bahis oranlarını her zaman görebilir; aynı oranlar AI tahmini
  // üretilirken de prompt'a dahil edilir (bkz. app/api/predict/route.ts).
  const tabs: PanelTabItem[] = [
    ...(hasStarted
      ? [
          { key: "events", label: t("analysis.tabEvents"), icon: <Activity className="h-3.5 w-3.5" /> },
          { key: "playerStats", label: t("analysis.tabPlayerStats"), icon: <Star className="h-3.5 w-3.5" /> },
          { key: "statistics", label: t("analysis.tabStatistics"), icon: <BarChart3 className="h-3.5 w-3.5" /> },
        ]
      : []),
    { key: "lineups", label: t("analysis.tabLineups"), icon: <Users className="h-3.5 w-3.5" /> },
    { key: "standings", label: t("analysis.tabStandings"), icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "teamStats", label: t("analysis.tabTeamStats"), icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: "odds", label: t("analysis.tabOdds"), icon: <Percent className="h-3.5 w-3.5" /> },
    { key: "h2h", label: t("analysis.tabH2H"), icon: <Swords className="h-3.5 w-3.5" /> },
    { key: "injuries", label: t("analysis.tabInjuries"), icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0].key)

  // Maç sonradan başlarsa (canlıya geçerse) ve o ana kadar seçili sekme
  // artık listede yoksa (örn. ilk sekme olan "lineups" hâlâ var olduğundan
  // bu durum oluşmaz), güvenlik amacıyla ilk sekmeye geri dön.
  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted])

  return (
    <div className="flex flex-col gap-2">
      {/* 1. Match header — panel açıldığında ekstra bir istek yapmadan anında gösterilir */}
      <MatchHeader fixture={fixture} />

      {/* Taraftar oylaması — tek tıkla oy, sonuç anında animasyonlu yüzde çubuğu */}
      <MatchVoteBar fixtureId={fixture.id} homeName={home.name} awayName={away.name} />

      {/* 2. AI Prediction */}
      {showPrediction && (
        <PredictionCard
          prediction={prediction ?? null}
          isLoading={predictionLoading ?? false}
          homeName={home.name}
          awayName={away.name}
          onPredict={isAdmin && isPredictable ? onPredict : undefined}
          isAdmin={isAdmin}
          onDelete={onDeletePrediction}
        />
      )}

      {/* Tahmin varsa: sosyal medyada paylaşılabilir afiş kartı üret/indir */}
      {hasPrediction && prediction && (
        <MatchShareActions fixture={fixture} prediction={prediction} />
      )}

      {/* Yan yana sekmeler — ilk sekme otomatik açılır, diğerleri sadece seçilince veri çeker */}
      <PanelTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {hasStarted && (
        <>
          <EventsSection fixtureId={fixture.id} homeName={home.name} active={activeTab === "events"} />
          <PlayerStatsSection fixtureId={fixture.id} home={home} away={away} active={activeTab === "playerStats"} />
          <StatisticsSection
            fixtureId={fixture.id}
            homeName={home.name}
            awayName={away.name}
            active={activeTab === "statistics"}
          />
        </>
      )}
      <OddsSection fixtureId={fixture.id} homeName={home.name} awayName={away.name} active={activeTab === "odds"} />
      <LineupsSection fixtureId={fixture.id} home={home} away={away} active={activeTab === "lineups"} />
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
  const { t } = useLanguage()
  const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])
  const isLive = LIVE_STATUSES.has(fixture.statusShort)
  const homeGoals = fixture.goalsHome
  const awayGoals = fixture.goalsAway
  const hasScore = homeGoals != null && awayGoals != null
  const statusTr = translateStatus(t, fixture.statusShort, fixture.elapsed, fixture.elapsedExtra)
  const { current: celebration, currentKey, advance } = useGoalCelebrationQueue(homeGoals, awayGoals)

  return (
    <div className="relative rounded-2xl border border-border/70 bg-card overflow-hidden">
      {/* Fixture kartındakiyle aynı 5 saniyelik gol kutlama animasyonu — panel
          açıkken de gol olduğunda header'ın üzerini kaplar. */}
      {celebration ? (
        <GoalCelebrationLazy
          celebration={celebration}
          currentKey={currentKey}
          fixtureId={fixture.id}
          homeTeamName={fixture.home.name}
          awayTeamName={fixture.away.name}
          homeTeamLogo={fixture.home.logo}
          awayTeamLogo={fixture.away.logo}
          onDone={advance}
        />
      ) : null}

      {/* League strip */}
      <div className="flex items-center justify-center gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2">
        {fixture.league.logo && (
          <img src={fixture.league.logo} alt="" className="h-4 w-4 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"  width={16} height={16} loading="lazy" decoding="async"/>
        )}
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
          {fixture.league.name}
          {fixture.league.round ? <span className="font-normal"> · {fixture.league.round}</span> : ""}
        </span>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5">
        {/* Home */}
        <TeamButton team={fixture.home} className="flex flex-col items-center gap-2 group">
          {fixture.home.logo && (
            <img src={fixture.home.logo} alt={fixture.home.name} className="h-14 w-14 object-contain drop-shadow-sm transition-transform group-hover:scale-105 rounded-full bg-white/95 p-0.5 ring-1 ring-black/5" width={56} height={56} fetchPriority="high" decoding="async" />
          )}
          <span className="text-center text-sm font-bold text-foreground text-balance leading-tight group-hover:text-primary transition-colors">{fixture.home.name}</span>
        </TeamButton>

        {/* Score / Status */}
        <div className="flex flex-col items-center gap-2 min-w-[80px]">
          {hasScore ? (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("text-4xl font-black tabular-nums", isLive ? "text-foreground" : homeGoals > awayGoals ? "text-primary" : "text-foreground")}>{homeGoals}</span>
                <span className="text-2xl font-light text-muted-foreground">:</span>
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
              <span className="text-2xl font-bold text-muted-foreground">vs</span>
              <span className="text-[11px] font-medium text-muted-foreground">{statusTr}</span>
            </div>
          )}
          {/* Venue */}
          {fixture.venue && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[90px]">{fixture.venue}</span>
            </span>
          )}
          {/* Referee */}
          {fixture.referee && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
            <img src={fixture.away.logo} alt={fixture.away.name} className="h-14 w-14 object-contain drop-shadow-sm transition-transform group-hover:scale-105 rounded-full bg-white/95 p-0.5 ring-1 ring-black/5" width={56} height={56} fetchPriority="high" decoding="async" />
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

function translateStatus(
  t: (key: string, vars?: Record<string, string | number>) => string,
  short: string,
  elapsed: number | null,
  elapsedExtra?: number | null,
): string {
  const min = typeof elapsed === "number"
    ? (elapsedExtra != null && elapsedExtra > 0 ? `${elapsed}+${elapsedExtra}'` : `${elapsed}'`)
    : null
  switch (short) {
    case "1H": return min ?? t("matchStatus.1H")
    case "2H": return min ?? t("matchStatus.2H")
    case "ET": return min ? `${min} (${t("matchStatus.ET")})` : t("matchStatus.ET")
    case "HT": return t("matchStatus.HT")
    case "BT": return t("matchStatus.BT")
    case "P":  return t("matchStatus.P")
    case "LIVE": return min ?? t("matchStatus.LIVE")
    case "FT":  return t("matchStatus.FT")
    case "AET": return t("matchStatus.AET")
    case "PEN": return t("matchStatus.PEN")
    case "NS":  return t("matchStatus.NS")
    case "TBD": return t("matchStatus.TBD")
    case "PST": return t("matchStatus.PST")
    case "CANC": return t("matchStatus.CANC")
    case "ABD": return t("matchStatus.ABD")
    case "SUSP": return t("matchStatus.SUSP")
    case "INT": return t("matchStatus.INT")
    case "AWD": return t("matchStatus.AWD")
    case "WO":  return t("matchStatus.WO")
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

function useLazySection<T>(url: string, open: boolean, autoRefresh = false) {
  const { t } = useLanguage()
  const [state, setState] = useState<SectionState<T>>({ status: "idle", data: null, error: null })
  // "hasLoadedRef" isteğin tamamlanıp tamamlanmadığını takip eder. React 18/19
  // geliştirme modunda (Strict Mode) her effect mount->unmount->mount şeklinde
  // iki kez çalışır: ilk çalıştırma başlattığı isteği cleanup'ta iptal eder,
  // ikinci çalıştırma ise gerçek isteği başlatıp tamamlar. Bu yüzden "zaten
  // başladı mı" kontrolünü sonuçlanmamış bir isteğin iptal edilmesine izin
  // verecek şekilde yapıyoruz — aksi halde ikinci (gerçek) mount hiç istek
  // başlatmaz ve arayüz sonsuza kadar "yükleniyor" durumunda kalır.
  const hasLoadedRef = useRef(false)
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  // silent=false: ilk yükleme, "yükleniyor" spinner'ı gösterir.
  // silent=true: otomatik arka plan yenilemesi ekranı spinner'a düşürmez.
  // Yeni istek başladığında eskisi iptal edilir; böylece geç dönen eski
  // istatistik cevabı yeni cevabın üzerine yazamaz.
  const fetchSection = useCallback((silent: boolean) => {
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    if (!silent) setState({ status: "loading", data: null, error: null })
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(translateApiError(t, body?.error, res.status))
        }
        return res.json() as Promise<{ data: T | null }>
      })
      .then((json) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        hasLoadedRef.current = true
        setState({ status: json.data === null ? "empty" : "success", data: json.data, error: null })
      })
      .catch((err) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        hasLoadedRef.current = true
        setState((prev) =>
          silent && prev.status === "success"
            ? prev
            : { status: "error", data: null, error: err instanceof Error ? err.message : t("common.unexpectedError") },
        )
      })
  }, [url, t])

  // Sekmeye her dönüşte taze veri çek; hasLoaded yalnızca otomatik refresh'i
  // ilk başarılı yüklemeden sonra çalıştırmak için kullanılır.
  useEffect(() => {
    if (!open) return
    hasLoadedRef.current = false
    fetchSection(false)
    return () => controllerRef.current?.abort()
  }, [open, fetchSection])

  // Otomatik yenileme (ortak 3 kural, bkz. useAutoRefresh): sadece bu sekme
  // aktifken (open=true) çalışır — 1) etkinleştiğinde hemen (ama ilk yükleme
  // üstteki effect tarafından zaten yapıldığından burada atlanır), 2) sekme
  // görünürken 30 saniyede bir, 3) sekmeye geri dönüldüğünde hemen. İlk yükleme
  // tamamlandıktan sonraki tüm tetiklemeler sessiz (spinner göstermeden) çalışır.
  useAutoRefresh(() => {
    if (!open || !hasLoadedRef.current) return
    fetchSection(true)
  }, autoRefresh && open)

  const retry = useCallback(() => {
    hasLoadedRef.current = false
    fetchSection(false)
  }, [fetchSection])
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
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{t("analysis.loadingSuffix", { label })}</p>
    </div>
  )
}

function SectionErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive/85" />
      <p className="text-xs font-bold text-destructive">{t("analysis.errorTitle")}</p>
      {error && <p className="text-[11px] text-muted-foreground">{error}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
      >
        <RotateCw className="h-3 w-3" />
        {t("common.retry")}
      </button>
    </div>
  )
}

function SectionEmptyState({ label }: { label: string }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{t("analysis.emptyFor", { label })}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Events — dikey zaman çizelgesi (klasik maç anlatımı düzeni): ev sahibi
// ortadaki çizginin soluna, konuk sağına yaslanır; her olay dakika + tür
// ikonu ile çizginin üzerinde bir "düğüm" oluşturur.
// ---------------------------------------------------------------------------

function EventsSection({ fixtureId, homeName, active }: { fixtureId: number; homeName: string; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<MatchEvent[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=events`,
    active,
    true,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingEvents")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyEvents")} />}
      {status === "success" && data && <EventsTimeline events={data} homeName={homeName} />}
    </SectionShell>
  )
}

const EVENT_DETAIL_KEY: Record<string, string> = {
  "Normal Goal": "normalGoal",
  "Own Goal": "ownGoal",
  "Penalty": "penalty",
  "Missed Penalty": "missedPenalty",
  "Yellow Card": "yellowCard",
  "Red Card": "redCard",
  "Yellow Red Card": "yellowRedCard",
  "Substitution 1": "substitution",
  "Substitution 2": "substitution",
  "Substitution 3": "substitution",
  "Substitution 4": "substitution",
  "Substitution 5": "substitution",
  "Substitution 6": "substitution",
  "Goal cancelled": "goalCancelled",
  "Penalty confirmed": "penaltyConfirmed",
  "Penalty cancelled": "penaltyCancelled",
  "Card upgrade": "cardUpgrade",
}

function translateDetail(t: (key: string) => string, detail: string): string {
  const key = EVENT_DETAIL_KEY[detail]
  return key ? t(`analysis.eventDetail.${key}`) : detail
}

/** Zaman çizelgesi düğümünün türü — her biri farklı bir ikon/renk alır. */
type EventNode =
  | { kind: "goal"; label: "G" | "OG" | "P" }
  | { kind: "card"; tone: "yellow" | "red" }
  | { kind: "subst" }
  | { kind: "miss" }
  | { kind: "other" }

function eventNode(type: string, detail: string): EventNode {
  if (type === "Goal") {
    // "Kaçırılan penaltı" ve "iptal edilen gol" bir GOL DEĞİL — eskiden bu
    // ikisi de yanlışlıkla gol ikonuyla ("G") gösteriliyordu.
    if (detail === "Missed Penalty" || detail === "Goal cancelled") return { kind: "miss" }
    if (detail === "Own Goal") return { kind: "goal", label: "OG" }
    if (detail === "Penalty") return { kind: "goal", label: "P" }
    return { kind: "goal", label: "G" }
  }
  if (type === "Card") {
    return { kind: "card", tone: detail === "Red Card" || detail === "Yellow Red Card" ? "red" : "yellow" }
  }
  if (type === "subst") return { kind: "subst" }
  return { kind: "other" }
}

/**
 * Çizelge düğümü: dakika rozetinin altında oturan renkli ikon. Arka planı
 * ana kart rengiyle (ring-card) "kesilerek" dikey çizginin üzerinden temiz
 * bir şekilde geçer — tasarım tokenlarının dışına çıkmadan (bg-primary,
 * bg-destructive, bg-secondary) net bir görsel hiyerarşi kurar.
 */
function EventNodeIcon({ node }: { node: EventNode }) {
  if (node.kind === "goal") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-sm ring-2 ring-card">
        {node.label}
      </span>
    )
  }
  if (node.kind === "card") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card shadow-sm ring-2 ring-card">
        <span className={cn("h-3.5 w-2.5 rounded-[2px]", node.tone === "red" ? "bg-destructive" : "bg-yellow-400")} />
      </span>
    )
  }
  if (node.kind === "subst") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-card">
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (node.kind === "miss") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-card">
        <X className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary shadow-sm ring-2 ring-card">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
    </span>
  )
}

/** Bir olayın oyuncu/asist metni — ev sahibi sağa, konuk sola hizalanır. */
function EventEntry({ ev, isHome, t }: { ev: MatchEvent; isHome: boolean; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const isSubst = ev.type === "subst"
  const detailTr = translateDetail(t, ev.detail)
  const rowDir = isHome ? "flex-row-reverse" : "flex-row"

  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", isHome ? "items-end text-right" : "items-start text-left")}>
      {isSubst ? (
        // ÖNEMLİ — API-Football'ın "subst" olaylarında alan adları ters
        // gibi görünür: `player` alanı sahadan ÇIKAN oyuncuyu, `assist`
        // alanı ise sahaya GİREN oyuncuyu tutar. Önceki sürüm bunu ters
        // varsayıp yeşil (giren) rengi çıkan oyuncuya veriyordu — burada
        // düzeltildi: giren oyuncu yukarıda yeşil ↑ ok, çıkan oyuncu
        // altında kırmızı ↓ ok ile gösteriliyor (yaygın maç anlatım deseni).
        <>
          {ev.assist && (
            <span className={cn("flex items-center gap-1.5 truncate text-xs font-semibold text-foreground", rowDir)}>
              <ArrowUp className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
              {ev.assistId ? (
                <PlayerButton player={{ id: ev.assistId, name: ev.assist, photo: null }} className="truncate hover:text-primary">
                  {ev.assist}
                </PlayerButton>
              ) : (
                ev.assist
              )}
            </span>
          )}
          {ev.player && (
            <span className={cn("flex items-center gap-1.5 truncate text-[11px] text-muted-foreground", rowDir)}>
              <ArrowDown className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
              {ev.playerId ? (
                <PlayerButton player={{ id: ev.playerId, name: ev.player, photo: null }} className="truncate hover:text-primary">
                  {ev.player}
                </PlayerButton>
              ) : (
                ev.player
              )}
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
            <span className="truncate text-[11px] text-muted-foreground">
              {t("analysis.assist")}:{" "}
              {ev.assistId ? (
                <PlayerButton player={{ id: ev.assistId, name: ev.assist, photo: null }} className="hover:text-primary">
                  {ev.assist}
                </PlayerButton>
              ) : (
                ev.assist
              )}
            </span>
          )}
          {ev.type !== "Goal" && <span className="text-[11px] text-muted-foreground">{detailTr}</span>}
        </>
      )}
    </div>
  )
}

function EventsTimeline({ events, homeName }: { events: MatchEvent[]; homeName: string }) {
  const { t } = useLanguage()
  const sorted = [...events].sort((a, b) => a.minute - b.minute)

  return (
    <div className="relative">
      {/* Ortadaki dikey çizgi — her düğüm (dakika rozeti + ikon) kartın arka
          plan rengiyle üzerine bindiğinden çizgiyi doğal olarak "keser". */}
      <div aria-hidden="true" className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border" />
      <ul className="relative flex flex-col">
        {sorted.map((ev, i) => {
          const isHome = ev.team === homeName
          const node = eventNode(ev.type, ev.detail)
          return (
            <li key={i} className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
              <div className={cn(!isHome && "invisible")}>
                {isHome && <EventEntry ev={ev} isHome t={t} />}
              </div>
              <div className="relative z-10 flex flex-col items-center gap-1 bg-card px-1">
                <span className="rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  {ev.minute}{ev.extra ? `+${ev.extra}` : ""}&#39;
                </span>
                <EventNodeIcon node={node} />
              </div>
              <div className={cn(isHome && "invisible")}>
                {!isHome && <EventEntry ev={ev} isHome={false} t={t} />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<FixturePlayerStat[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=playerStats`,
    active,
    true,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingPlayerStats")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyPlayerStats")} />}
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
  const { t } = useLanguage()
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
            {side.team.logo && <img src={side.team.logo} alt="" className="h-4 w-4 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"  width={16} height={16} loading="lazy" decoding="async"/>}
            {side.team.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b border-border/60">
              <th className="pb-2 pl-1 text-left font-semibold text-muted-foreground min-w-[130px]">{t("analysis.colPlayer")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9">{t("analysis.colMinutes")}</th>
              <th className="pb-2 text-center font-semibold text-amber-500 w-9" title={t("analysis.colRatingTitle")}>{t("analysis.colRating")}</th>
              <th className="pb-2 text-center font-semibold text-primary w-9" title={t("analysis.colGoalsTitle")}>{t("analysis.colGoals")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colAssistsTitle")}>{t("analysis.colAssists")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colShotsTitle")}>{t("analysis.colShots")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colShotsOnTitle")}>{t("analysis.colShotsOn")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colPassesTitle")}>{t("analysis.colPasses")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colDribblesTitle")}>{t("analysis.colDribbles")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-9" title={t("analysis.colTacklesTitle")}>{t("analysis.colTackles")}</th>
              <th className="pb-2 text-center font-semibold text-muted-foreground w-8" title={t("analysis.colCardsTitle")}>{t("analysis.colCards")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const rating = p.rating ? parseFloat(p.rating) : null
              const ratingColor = rating == null ? "" : rating >= 8 ? "text-primary font-black" : rating >= 7 ? "text-primary/90 font-bold" : rating >= 6 ? "text-foreground font-semibold" : "text-muted-foreground"
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
                        <PlayerPhoto photo={p.player.photo} name={p.player.name} size={24} />
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
                        <span className="text-[10px] text-muted-foreground">
                          {p.player.pos ?? ""}
                          {p.substitute ? t("analysis.substituteSuffix") : ""}
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
                      <span className="inline-block h-3.5 w-2.5 rounded-sm bg-destructive" title={t("analysis.redCard")} />
                    ) : p.yellowCard ? (
                      <span className="inline-block h-3.5 w-2.5 rounded-sm bg-yellow-400" title={t("analysis.yellowCard")} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
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

const STAT_TYPE_KEY: Record<string, string> = {
  "Shots on Goal": "shotsOnGoal",
  "Shots off Goal": "shotsOffGoal",
  "Total Shots": "totalShots",
  "Blocked Shots": "blockedShots",
  "Shots insidebox": "shotsInsideBox",
  "Shots outsidebox": "shotsOutsideBox",
  "Fouls": "fouls",
  "Corner Kicks": "cornerKicks",
  "Offsides": "offsides",
  "Ball Possession": "ballPossession",
  "Yellow Cards": "yellowCards",
  "Red Cards": "redCards",
  "Goalkeeper Saves": "goalkeeperSaves",
  "Total passes": "totalPasses",
  "Passes accurate": "passesAccurate",
  "Passes %": "passesPercent",
  "expected_goals": "expectedGoals",
  "Expected Goals": "expectedGoals",
  "goals_prevented": "goalsPrevented",
  "Penalty Kicks": "penaltyKicks",
}

const HIDE_IF_BOTH_EMPTY = new Set(["expected_goals", "Expected Goals", "goals_prevented", "Goals Prevented"])

function translateStat(t: (key: string) => string, type: string): string {
  const key = STAT_TYPE_KEY[type]
  return key ? t(`analysis.statType.${key}`) : type
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<StatItem[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=statistics`,
    active,
    true,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingStatistics")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyStatistics")} />}
      {status === "success" && data && <StatsList stats={data} homeName={homeName} awayName={awayName} />}
    </SectionShell>
  )
}

function StatsList({ stats, homeName, awayName }: { stats: StatItem[]; homeName: string; awayName: string }) {
  const { t } = useLanguage()
  const toNum = (v: string | number | null) =>
    typeof v === "string" ? Number.parseFloat(v.replace("%", "")) : (v ?? 0)

  // Çubuklar önce sıfır genişlikte render edilir, sonraki tick'te gerçek
  // yüzdelerine "dolarak" büyür — bir istatistik sayfasının verisi
  // canlandırılmış hissi verir.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

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
              <span className="flex-1 text-center text-[11px] text-muted-foreground">{translateStat(t, s.type)}</span>
              <span className="w-10 text-right text-xs font-bold tabular-nums text-foreground">{s.away ?? "—"}</span>
            </div>
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: filled ? `${hPct}%` : "0%", transitionDelay: `${Math.min(i * 40, 320)}ms` }}
              />
              <div
                className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                style={{ width: filled ? `${aPct}%` : "0%", transitionDelay: `${Math.min(i * 40, 320)}ms` }}
              />
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

function LineupsSection({
  fixtureId,
  home,
  away,
  active,
}: {
  fixtureId: number
  home: TeamInfo
  away: TeamInfo
  active: boolean
}) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<TeamLineup[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=lineups`,
    active,
  )
  return (
    <SectionShell active={active}>
      {/* Genel "spinner + kısa metin" yükleme durumu yerine, gerçek saha
          görselleştirmesiyle yaklaşık aynı yüksekliğe sahip bir iskelet
          gösteriyoruz. Aksi halde küçük bir spinner alanından aniden çok
          daha uzun bir sahaya geçildiğinde sayfa altındaki içerik sertçe
          aşağı kayıyor / "zıplıyor" gibi hissettiriyordu. */}
      {status === "loading" && <LineupsSkeleton />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyLineups")} />}
      {status === "success" && data && <LineupsView lineups={data} home={home} away={away} />}
    </SectionShell>
  )
}

/** Saha + kadro görselleştirmesinin yaklaşık yüksekliğinde iskelet — ani içerik sıçramasını önler. */
function LineupsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm">
        {/* Away header skeleton */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          </div>
          <div className="h-4 w-10 animate-pulse rounded-md bg-secondary" />
        </div>

        {/* Pitch skeleton — gerçek FormationPitch ile aynı aspect-ratio */}
        <div
          className="relative w-full animate-pulse overflow-hidden rounded-xl bg-secondary/50 shadow-inner ring-1 ring-black/5"
          style={{ aspectRatio: "68 / 100" }}
        />

        {/* Home header skeleton */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          </div>
          <div className="h-4 w-10 animate-pulse rounded-md bg-secondary" />
        </div>
      </div>

      {/* Bench skeleton */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-3">
        {[0, 1].map((col) => (
          <div key={col} className="flex flex-col gap-1.5">
            <div className="mb-0.5 h-3 w-16 animate-pulse rounded bg-secondary border-b border-border/60 pb-1.5" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-secondary" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-secondary" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** API-Football grid formatı "satır:sütun" — geçerli mi diye kontrol eder. */
function parseGrid(grid: string | null): { row: number; col: number } | null {
  if (!grid) return null
  const [rowStr, colStr] = grid.split(":")
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null
  return { row, col }
}

/** Bir takımın ilk 11'ini, dizilişine göre sahadaki (x%, y%) konumlarına dağıtır. */
function computePitchSlots(
  startXI: LineupPlayer[],
  half: "bottom" | "top",
): { player: LineupPlayer; leftPct: number; topPct: number }[] {
  const rows = new Map<number, LineupPlayer[]>()
  for (const p of startXI) {
    const g = parseGrid(p.grid)
    if (!g) continue
    if (!rows.has(g.row)) rows.set(g.row, [])
    rows.get(g.row)!.push(p)
  }

  const rowNumbers = [...rows.keys()].sort((a, b) => a - b)
  const maxRowIdx = Math.max(rowNumbers.length - 1, 1)

  const X_MIN = 8
  const X_MAX = 92
  // GK'nin sahaya en yakın kenar; en ileri hattın orta çizgiye yakın konumu
  const [gkY, attackY] = half === "bottom" ? [95, 56] : [5, 44]

  const slots: { player: LineupPlayer; leftPct: number; topPct: number }[] = []
  rowNumbers.forEach((rowNum, rowIdx) => {
    const players = [...rows.get(rowNum)!].sort((a, b) => {
      const ga = parseGrid(a.grid)!
      const gb = parseGrid(b.grid)!
      return ga.col - gb.col
    })
    const t = rowNumbers.length <= 1 ? 0 : rowIdx / maxRowIdx
    const topPct = gkY + (attackY - gkY) * t
    players.forEach((p, i) => {
      const leftPct = X_MIN + ((i + 1) / (players.length + 1)) * (X_MAX - X_MIN)
      slots.push({ player: p, leftPct, topPct })
    })
  })

  return slots
}

function LineupsView({ lineups, home, away }: { lineups: TeamLineup[]; home: TeamInfo; away: TeamInfo }) {
  const homeLineup = lineups.find((l) => l.team === home.name) ?? lineups[0] ?? null
  const awayLineup = lineups.find((l) => l.team === away.name) ?? lineups.find((l) => l !== homeLineup) ?? null

  const hasValidGrid = (l: TeamLineup | null) => !!l && l.startXI.length > 0 && l.startXI.every((p) => !!parseGrid(p.grid))
  const canRenderPitch = hasValidGrid(homeLineup) && hasValidGrid(awayLineup)

  return (
    <div className="flex flex-col gap-4">
      {canRenderPitch && homeLineup && awayLineup ? (
        <FormationPitch home={home} homeLineup={homeLineup} away={away} awayLineup={awayLineup} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lineups.map((l) => (
            <LegacyLineupCard key={l.team} lineup={l} />
          ))}
        </div>
      )}

      {canRenderPitch && (homeLineup?.substitutes.length || awayLineup?.substitutes.length) ? (
        <BenchRow
          home={home}
          homeSubs={homeLineup?.substitutes ?? []}
          away={away}
          awaySubs={awayLineup?.substitutes ?? []}
        />
      ) : null}
    </div>
  )
}

/** Geçerli grid verisi olmayan istisnai durumlar için eski, basit liste görünümü. */
function LegacyLineupCard({ lineup: l }: { lineup: TeamLineup }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-foreground">{l.team}</span>
          {l.coach && <span className="text-[11px] text-muted-foreground">{t("analysis.coachPrefix")}: {l.coach}</span>}
        </div>
        {l.formation && (
          <span className="rounded-lg border border-border bg-card px-2 py-0.5 text-[11px] font-mono font-bold text-muted-foreground">
            {l.formation}
          </span>
        )}
      </div>

      {l.startXI.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">{t("analysis.startingXI")}</p>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {l.startXI.map((p, idx) => (
              <PlayerLineupRow key={idx} player={p} isStarter />
            ))}
          </ol>
        </div>
      )}

      {l.substitutes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t("analysis.substitutes")}</p>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {l.substitutes.map((p, idx) => (
              <PlayerLineupRow key={idx} player={p} isStarter={false} />
            ))}
          </ol>
        </div>
      )}
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
        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
          {player.pos}
        </span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Formation pitch — dikey, çim çizgili premium saha görselleştirmesi
// ---------------------------------------------------------------------------

function FormationPitch({
  home,
  homeLineup,
  away,
  awayLineup,
}: {
  home: TeamInfo
  homeLineup: TeamLineup
  away: TeamInfo
  awayLineup: TeamLineup
}) {
  const homeSlots = computePitchSlots(homeLineup.startXI, "bottom")
  const awaySlots = computePitchSlots(awayLineup.startXI, "top")

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm">
      {/* Away team header (üstte, sahanın üst yarısıyla eşleşir) */}
      <TeamFormationHeader team={away} lineup={awayLineup} align="left" />

      <div
        className="relative w-full overflow-hidden rounded-xl shadow-inner ring-1 ring-black/5"
        style={{
          aspectRatio: "68 / 100",
          backgroundColor: "var(--pitch)",
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--pitch-soft) 0, var(--pitch-soft) 9%, var(--pitch) 9%, var(--pitch) 18%)",
        }}
      >
        <PitchMarkings />

        {homeSlots.map((slot, idx) => (
          <PlayerPitchIcon key={`home-${idx}`} player={slot.player} side="home" leftPct={slot.leftPct} topPct={slot.topPct} />
        ))}
        {awaySlots.map((slot, idx) => (
          <PlayerPitchIcon key={`away-${idx}`} player={slot.player} side="away" leftPct={slot.leftPct} topPct={slot.topPct} />
        ))}
      </div>

      {/* Home team header (altta, sahanın alt yarısıyla eşleşir) */}
      <TeamFormationHeader team={home} lineup={homeLineup} align="left" />
    </div>
  )
}

function TeamFormationHeader({
  team,
  lineup,
  align,
}: {
  team: TeamInfo
  lineup: TeamLineup
  align: "left"
}) {
  const { t } = useLanguage()
  return (
    <div className={cn("flex items-center gap-2 px-1", align === "left" && "justify-between")}>
      <div className="flex items-center gap-2">
        {team.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo || "/placeholder.svg"} alt="" className="h-5 w-5 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"  width={20} height={20} loading="lazy" decoding="async"/>
        ) : null}
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-bold text-foreground">{team.name}</span>
          {lineup.coach && <span className="text-[10px] text-muted-foreground">{t("analysis.coachPrefix")}: {lineup.coach}</span>}
        </div>
      </div>
      {lineup.formation && (
        <span className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
          {lineup.formation}
        </span>
      )}
    </div>
  )
}

/** SVG çim çizgileri: orta çizgi, orta yuvarlak, ceza sahaları, kale sahaları, korner çeyrekleri. */
function PitchMarkings() {
  const line = { stroke: "var(--pitch-line)", strokeWidth: 0.4, fill: "none" } as const
  return (
    <svg
      viewBox="0 0 68 105"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* Dış çizgiler */}
      <rect x={0.3} y={0.3} width={67.4} height={104.4} {...line} />
      {/* Orta çizgi */}
      <line x1={0} y1={52.5} x2={68} y2={52.5} {...line} />
      {/* Orta yuvarlak + nokta */}
      <circle cx={34} cy={52.5} r={9.15} {...line} />
      <circle cx={34} cy={52.5} r={0.5} fill="var(--pitch-line)" stroke="none" />
      {/* Üst ceza sahası */}
      <rect x={13.84} y={0.3} width={40.32} height={16.5} {...line} />
      <rect x={24.84} y={0.3} width={18.32} height={5.5} {...line} />
      <circle cx={34} cy={11} r={0.5} fill="var(--pitch-line)" stroke="none" />
      <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" {...line} />
      {/* Alt ceza sahası */}
      <rect x={13.84} y={88.2} width={40.32} height={16.5} {...line} />
      <rect x={24.84} y={99.2} width={18.32} height={5.5} {...line} />
      <circle cx={34} cy={94} r={0.5} fill="var(--pitch-line)" stroke="none" />
      <path d="M 26.69 88.5 A 9.15 9.15 0 0 1 41.31 88.5" {...line} />
      {/* Korner çeyrekleri */}
      <path d="M 0 3 A 3 3 0 0 0 3 0" {...line} />
      <path d="M 65 0 A 3 3 0 0 0 68 3" {...line} />
      <path d="M 68 102 A 3 3 0 0 0 65 105" {...line} />
      <path d="M 3 105 A 3 3 0 0 0 0 102" {...line} />
    </svg>
  )
}

function PlayerPitchIcon({
  player,
  side,
  leftPct,
  topPct,
}: {
  player: LineupPlayer
  side: "home" | "away"
  leftPct: number
  topPct: number
}) {
  const [imgError, setImgError] = useState(false)
  const photoUrl = player.id ? `https://media.api-sports.io/football/players/${player.id}.png` : null
  const showPhoto = !!photoUrl && !imgError

  const avatar = (
    <div
      className={cn(
        "relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-md ring-2 sm:h-8 sm:w-8",
        side === "home" ? "ring-card" : "ring-accent",
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          className="h-full w-full bg-card object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center text-[9px] font-bold tabular-nums sm:text-[11px]",
            side === "home" ? "bg-card text-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          {player.number ?? "–"}
        </span>
      )}
    </div>
  )

  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 sm:gap-1"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    >
      {player.id ? (
        <PlayerButton player={{ id: player.id, name: player.name, photo: null }} className="flex flex-col items-center">
          {avatar}
        </PlayerButton>
      ) : (
        avatar
      )}
      {/* Mobilde saha daha dar olduğundan bitişik oyuncuların adları üst üste
          biniyordu — rozeti dar ekranlarda küçültüp daha az yer kaplatıyoruz,
          geniş ekranlarda (sm:) eski boyutuna dönüyor. */}
      <span className="max-w-[40px] truncate rounded-full bg-card/90 px-1 py-0.5 text-[7px] font-semibold text-foreground shadow-sm backdrop-blur-sm sm:max-w-[68px] sm:px-1.5 sm:text-[9px]">
        {player.name.split(" ").pop()}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bench — sahanın altında iki takımın yedekleri yan yana
// ---------------------------------------------------------------------------

function BenchRow({
  home,
  homeSubs,
  away,
  awaySubs,
}: {
  home: TeamInfo
  homeSubs: LineupPlayer[]
  away: TeamInfo
  awaySubs: LineupPlayer[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <BenchColumn team={home} subs={homeSubs} side="home" />
      <BenchColumn team={away} subs={awaySubs} side="away" />
    </div>
  )
}

function BenchColumn({ team, subs, side }: { team: TeamInfo; subs: LineupPlayer[]; side: "home" | "away" }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="mb-0.5 flex items-center gap-1.5 border-b border-border/60 pb-1.5">
        {team.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"  width={16} height={16} loading="lazy" decoding="async"/>
        ) : null}
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {t("analysis.substitutes")}
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {subs.map((p, idx) => (
          <li key={idx} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                side === "home" ? "bg-secondary text-foreground" : "bg-accent/15 text-accent",
              )}
            >
              {p.number ?? "—"}
            </span>
            {p.id ? (
              <PlayerButton player={{ id: p.id, name: p.name, photo: null }} className="truncate text-foreground hover:text-primary">
                {p.name}
              </PlayerButton>
            ) : (
              <span className="truncate text-foreground">{p.name}</span>
            )}
            {p.pos && <span className="ml-auto shrink-0 text-[9px] font-semibold text-muted-foreground">{p.pos}</span>}
          </li>
        ))}
      </ol>
    </div>
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<StandingRow[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=standings&leagueId=${leagueId}&season=${season}&homeId=${homeId}&awayId=${awayId}`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingStandings")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyStandings")} />}
      {status === "success" && data && <StandingsTable standings={data} homeId={homeId} awayId={awayId} />}
    </SectionShell>
  )
}

function StandingsTable({ standings, homeId, awayId }: { standings: StandingRow[]; homeId: number; awayId: number }) {
  const { t } = useLanguage()
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[480px] text-xs">
        <thead>
          <tr className="border-b border-border/60">
            <th className="pb-2 pl-1 text-left font-semibold text-muted-foreground w-6">#</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">{t("analysis.standTeam")}</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">{t("analysis.standPlayed")}</th>
            <th className="pb-2 text-center font-semibold text-primary w-8">{t("analysis.standWin")}</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">{t("analysis.standDraw")}</th>
            <th className="pb-2 text-center font-semibold text-destructive w-8">{t("analysis.standLose")}</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">{t("analysis.standGoalsFor")}</th>
            <th className="pb-2 text-center font-semibold text-muted-foreground w-8">{t("analysis.standGoalsAgainst")}</th>
            <th className="pb-2 text-center font-semibold text-foreground w-8">{t("analysis.standPoints")}</th>
            <th className="pb-2 text-left font-semibold text-muted-foreground">{t("analysis.standLast5")}</th>
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<{ homeStats: TeamSeasonStats | null; awayStats: TeamSeasonStats | null }>(url, active)
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingTeamStats")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyTeamStats")} />}
      {status === "success" && data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.homeStats && <TeamStatsCard stats={data.homeStats} label={t("analysis.homeSide")} />}
          {data.awayStats && <TeamStatsCard stats={data.awayStats} label={t("analysis.awaySide")} />}
        </div>
      )}
    </SectionShell>
  )
}

function TeamStatsCard({ stats, label }: { stats: TeamSeasonStats; label: string }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <TeamButton team={stats.team} className="flex items-center gap-2 group">
          {stats.team.logo && (
            <img src={stats.team.logo} alt={stats.team.name} className="h-7 w-7 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"  width={28} height={28} loading="lazy" decoding="async"/>
          )}
          <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{stats.team.name}</span>
        </TeamButton>
        <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{t("analysis.recentForm")}</span>
        <FormBadge form={stats.formString} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <StatCell label={t("analysis.statPlayed")} value={stats.played} />
        <StatCell label={t("analysis.statGoalsForAvg")} value={stats.goalsForAvg.toFixed(1)} />
        <StatCell label={t("analysis.statGoalsAgainstAvg")} value={stats.goalsAgainstAvg.toFixed(1)} />
        <StatCell label={t("analysis.statWins")} value={stats.wins} accent="text-primary" />
        <StatCell label={t("analysis.statDraws")} value={stats.draws} />
        <StatCell label={t("analysis.statLosses")} value={stats.losses} accent="text-destructive" />
        <StatCell label={t("analysis.statCleanSheets")} value={stats.cleanSheets} />
        <StatCell label={t("analysis.statFailedToScore")} value={stats.failedToScore} />
      </div>
      {stats.recent.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t("analysis.recentMatches")}</p>
          <ul className="flex flex-col gap-1">
            {stats.recent.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card px-2.5 py-1.5 text-xs">
                <span className="shrink-0 tabular-nums text-muted-foreground text-[10px]">{g.date.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate text-center text-foreground">{t("analysis.vsPrefix")} {g.opponent}</span>
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
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const { t } = useLanguage()
  const map = {
    W: { label: t("analysis.resultWin"), cls: "bg-primary/15 text-primary border-primary/20" },
    D: { label: t("analysis.resultDraw"), cls: "bg-secondary text-muted-foreground border-border/60" },
    L: { label: t("analysis.resultLoss"), cls: "bg-destructive/15 text-destructive border-destructive/20" },
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<FormGame[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=h2h&homeId=${homeId}&awayId=${awayId}`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingH2H")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyH2H")} />}
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
  // Summary: home wins, draws, away wins.
  // `g.result` API-football üzerinden zaten güncel maçın ev sahibi takımı
  // (bu bileşene `homeName` olarak geçirilen takım) perspektifinden geliyor:
  // "W" = o takım o geçmiş maçı kazandı, "L" = rakip kazandı — geçmiş maçta
  // hangi takımın kendi sahasında oynadığından bağımsız. Bu yüzden burada
  // `g.home` / `g.homeTeam` ile tekrar bir "ev sahibi mi" kontrolü yapmaya
  // gerek yok; yapılırsa deplasmanda oynanan maçlarda kazanan taraf ters
  // gösterilir.
  const { t } = useLanguage()
  const homeWins = h2h.filter((g) => g.result === "W").length
  const draws = h2h.filter((g) => g.result === "D").length
  const awayWins = h2h.filter((g) => g.result === "L").length

  // Özet çubuğu da istatistik çubuklarıyla aynı desende sıfırdan dolarak
  // büyür.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold truncate max-w-[35%]">{homeName}</span>
          <span className="text-[10px] text-muted-foreground">{t("analysis.matchesShort", { count: h2h.length })}</span>
          <span className="text-[11px] font-semibold truncate max-w-[35%] text-right">{awayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="flex h-2 rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: filled ? `${(homeWins / h2h.length) * 100}%` : "0%", minWidth: homeWins > 0 ? "8px" : "0" }}
          />
          <div
            className="flex h-2 rounded-full bg-secondary transition-all duration-700 ease-out"
            style={{ width: filled ? `${(draws / h2h.length) * 100}%` : "0%", minWidth: draws > 0 ? "8px" : "0" }}
          />
          <div
            className="flex h-2 rounded-full bg-accent transition-all duration-700 ease-out"
            style={{ width: filled ? `${(awayWins / h2h.length) * 100}%` : "0%", minWidth: awayWins > 0 ? "8px" : "0" }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs font-black text-primary tabular-nums">{homeWins}{t("analysis.resultWin")}</span>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{draws}{t("analysis.resultDraw")}</span>
          <span className="text-xs font-black text-accent tabular-nums">{awayWins}{t("analysis.resultWin")}</span>
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
          // Renk, o geçmiş maçta kimin evinde oynadığına değil, güncel fikstürdeki
          // takım kimliğine göre atanmalı (özet çubuğuyla aynı: homeName = primary,
          // awayName = accent). `g.home` burada "homeName bu geçmiş maçta evinde
          // oynadı mı" anlamına geliyor, dolayısıyla sol/sağ pozisyonun hangi takıma
          // ait olduğunu belirler.
          const leftIsHomeName = g.home
          const leftWinColor = leftIsHomeName ? "text-primary" : "text-accent"
          const rightWinColor = leftIsHomeName ? "text-accent" : "text-primary"
          const rowContent = (
            <>
              <span className={cn("truncate text-xs", homeWon ? "font-bold text-foreground" : "text-muted-foreground")}>{displayHome}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] tabular-nums text-muted-foreground">{g.date.slice(0, 10)}</span>
                <span className={cn("text-xs font-black tabular-nums", homeWon ? leftWinColor : "text-foreground")}>{homeGoals}</span>
                <span className="text-muted-foreground text-xs">-</span>
                <span className={cn("text-xs font-black tabular-nums", awayWon ? rightWinColor : "text-foreground")}>{awayGoals}</span>
              </div>
              <span className={cn("truncate text-xs text-right", awayWon ? "font-bold text-foreground" : "text-muted-foreground")}>{displayAway}</span>
            </>
          )
          const rowClassName = "grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2"
          return (
            <li key={i}>
              {g.fixtureId ? (
                <MatchButton fixture={{ id: g.fixtureId }} className={cn("w-full hover:bg-secondary/40", rowClassName)}>
                  {rowContent}
                </MatchButton>
              ) : (
                <div className={rowClassName}>{rowContent}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Odds — Maç oranları. AI tahmininden tamamen bağımsız olarak, oynanmamış her
// maçta gösterilir; aynı oranlar AI tahmini üretilirken de kullanılır (bkz.
// app/api/predict/route.ts → formatOdds).
// ---------------------------------------------------------------------------

type OddsData = { home: number | null; draw: number | null; away: number | null; source: string | null }

function OddsSection({
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
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<OddsData>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=odds`,
    active,
  )

  const entries: Array<{ key: "home" | "draw" | "away"; label: string; value: number | null }> = data
    ? [
        { key: "home", label: t("analysis.predictionOddsHome", { team: homeName }), value: data.home },
        { key: "draw", label: t("analysis.predictionOddsDraw"), value: data.draw },
        { key: "away", label: t("analysis.predictionOddsAway", { team: awayName }), value: data.away },
      ]
    : []
  const validEntries = entries.filter(
    (e): e is { key: "home" | "draw" | "away"; label: string; value: number } => e.value !== null,
  )
  const favorite = validEntries.length > 0 ? validEntries.reduce((a, b) => (a.value < b.value ? a : b)) : null
  const favoriteTeamLabel = favorite?.key === "home" ? homeName : favorite?.key === "away" ? awayName : t("analysis.draw")

  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.tabOdds")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.tabOdds")} />}
      {status === "success" && validEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {entries.map((entry) =>
              entry.value === null ? (
                <div
                  key={entry.key}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border/40 bg-secondary/20 px-2 py-3 text-center"
                >
                  <span className="text-[10px] font-semibold text-muted-foreground">{entry.label}</span>
                  <span className="text-sm font-bold text-muted-foreground">—</span>
                </div>
              ) : (
                <div
                  key={entry.key}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center",
                    favorite?.key === entry.key
                      ? "border-primary/30 bg-primary/8"
                      : "border-border/60 bg-secondary/30",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-semibold truncate max-w-full",
                      favorite?.key === entry.key ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {entry.label}
                  </span>
                  <span
                    className={cn(
                      "text-lg font-black tabular-nums",
                      favorite?.key === entry.key ? "text-primary" : "text-foreground",
                    )}
                  >
                    {entry.value.toFixed(2)}
                  </span>
                </div>
              ),
            )}
          </div>
          {favorite && (
            <p className="text-center text-[11px] font-semibold text-muted-foreground">
              {t("analysis.predictionOddsFavorite", { team: favoriteTeamLabel })}
            </p>
          )}
        </div>
      )}
    </SectionShell>
  )
}

// ---------------------------------------------------------------------------
// Injuries
// ---------------------------------------------------------------------------

const INJURY_TYPE_KEY: Record<string, string> = {
  "Missing Fixture": "missingFixture",
  "Questionable": "questionable",
  "Out": "out",
}

function InjuriesSection({ fixtureId, active }: { fixtureId: number; active: boolean }) {
  const { t } = useLanguage()
  const { status, data, error, retry } = useLazySection<InjuryItem[]>(
    `/api/analyze/section?fixtureId=${fixtureId}&section=injuries`,
    active,
  )
  return (
    <SectionShell active={active}>
      {status === "loading" && <SectionLoading label={t("analysis.loadingInjuries")} />}
      {status === "error" && <SectionErrorState error={error} onRetry={retry} />}
      {status === "empty" && <SectionEmptyState label={t("analysis.emptyInjuries")} />}
      {status === "success" && data && <InjuryList injuries={data} />}
    </SectionShell>
  )
}

function InjuryList({ injuries }: { injuries: InjuryItem[] }) {
  const { t } = useLanguage()
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
                      {INJURY_TYPE_KEY[item.type] ? t(`analysis.injuryType.${INJURY_TYPE_KEY[item.type]}`) : item.type}
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

// İstatistik (Poisson) modeli arka planda ensemble'a katılır ama kullanıcıya
// hiçbir yerde gösterilmez — model oyları listesinden ve sayaçtan filtrelenir.
function isHiddenModel(modelId: string): boolean {
  return modelId.startsWith("poisson/")
}

/**
 * Model adını kısa etiket + renk sınıfına çevirir.
 * Gerçek sağlayıcı/model adları (GPT, Gemini, Grok) kullanıcıya hiçbir yerde
 * gösterilmez; bunun yerine nötr kod adları kullanılır. Aynı sağlayıcının
 * farklı sürümleri (3.6/3.7, 4.5/4.6) de tek etikette birleştirilir.
 */
function modelLabel(modelId: string): { short: string; colorCls: string } {
  if (modelId.startsWith("openai/"))    return { short: "Orion", colorCls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400" }
  if (modelId.startsWith("anthropic/")) return { short: "Claude", colorCls: "bg-orange-500/10  text-orange-600  border-orange-500/20  dark:text-orange-400"  }
  if (modelId.startsWith("google/"))    return { short: "Atlas", colorCls: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400" }
  if (modelId.startsWith("xai/"))       return { short: "Vega",  colorCls: "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400" }
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
  const { t } = useLanguage()
  const { short, colorCls } = modelLabel(vote.model)
  const winnerLabel =
    vote.winner === "home" ? homeName : vote.winner === "away" ? awayName : t("analysis.draw")

  // Self-consistency anlaşma göstergesi — eski cache'lenmiş tahminlerde bu
  // alan bulunmayabilir (agreement özelliği eklenmeden önce üretilmiş).
  const agreementPct = typeof vote.agreement === "number" ? Math.round(vote.agreement * 100) : null
  const agreementDotCls =
    agreementPct === null
      ? null
      : agreementPct >= 100
        ? "bg-emerald-500"
        : agreementPct >= 67
          ? "bg-amber-500"
          : "bg-rose-500"
  const agreementLabel =
    agreementPct === null
      ? ""
      : agreementPct >= 100
        ? t("analysis.predictionAgreementHigh")
        : agreementPct >= 67
          ? t("analysis.predictionAgreementMed")
          : t("analysis.predictionAgreementLow")

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2">
      {/* Model chip */}
      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", colorCls)}>
        {short}
      </span>

      {/* Self-consistency anlaşma göstergesi */}
      {agreementDotCls && agreementPct !== null && (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", agreementDotCls)}
          title={`${agreementLabel} · ${t("analysis.predictionAgreementTooltip", { pct: agreementPct })}`}
          aria-label={`${agreementLabel}: ${agreementPct}%`}
        />
      )}

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
          {vote.btts ? t("analysis.predictionBttsShortYes") : t("analysis.predictionBttsShortNo")}
        </span>
        <span className={cn(
          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
          vote.overUnder === "over"
            ? "border-primary/25 bg-primary/8 text-primary"
            : "border-border/60 bg-secondary/60 text-muted-foreground",
        )}>
          {vote.overUnder === "over" ? t("analysis.predictionOverShort") : t("analysis.predictionUnderShort")}
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
          {t("analysis.percentValue", { n: vote.confidence })}
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
  isAdmin,
  onDelete,
}: {
  prediction: MatchPrediction | null
  isLoading: boolean
  homeName: string
  awayName: string
  onPredict?: () => void
  isAdmin?: boolean
  onDelete?: () => Promise<void> | void
}) {
  const { t, locale } = useLanguage()
  const [showVotes, setShowVotes] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteConfirmed = useCallback(async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      toast.success(t("analysis.predictionDeleteSuccess"))
      setDeleteConfirmOpen(false)
    } catch {
      toast.error(t("analysis.predictionDeleteError"))
    } finally {
      setDeleting(false)
    }
  }, [onDelete, t])

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <div>
          <p className="text-xs font-semibold text-foreground">{t("analysis.predictionPreparing")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("analysis.predictionPreparingSub")}
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
            <p className="text-xs font-semibold text-foreground">{t("analysis.predictionTitle")}</p>
            <p className="text-[11px] text-muted-foreground">{t("analysis.predictionModelsSubtitle")}</p>
          </div>
        </div>
        {onPredict && (
          <button
            type="button"
            onClick={onPredict}
            className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95"
          >
            {t("analysis.predictionGetButton")}
          </button>
        )}
      </div>
    )
  }

  const winnerLabel =
    prediction.winner === "home"
      ? t("analysis.predictionWinsSuffix", { team: homeName })
      : prediction.winner === "away"
        ? t("analysis.predictionWinsSuffix", { team: awayName })
        : t("analysis.draw")

  const confidenceColor =
    prediction.confidence >= 70
      ? "text-primary"
      : prediction.confidence >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-muted-foreground"

  // İstatistik (Poisson) modeli arka planda ensemble'a katılır ama kullanıcıya
  // gösterilmez — sayaç ve oy listesi sadece görünür (LLM) modelleri kapsar.
  const visibleModelVotes = prediction.modelVotes?.filter((v) => !isHiddenModel(v.model)) ?? []
  const modelCount = visibleModelVotes.length

  // İngilizce kullanıcılar için çeviri varsa onu göster, yoksa Türkçe'ye geri dön
  // (özet/faktörler için tek bir ek çeviri çağrısı ile üretilir, bkz. app/api/predict/route.ts)
  const displaySummary = locale === "en" && prediction.summaryEn ? prediction.summaryEn : prediction.summary
  const displayKeyFactors =
    locale === "en" && prediction.keyFactorsEn?.length ? prediction.keyFactorsEn : prediction.keyFactors

  return (
    <>
    <div className="rounded-2xl border border-primary/25 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-primary/5 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">{t("analysis.predictionTitle")}</span>
        {modelCount > 0 && (
          <span className="rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-bold text-primary">
            {t("analysis.predictionModelCountBadge", { count: modelCount })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {t("analysis.predictionValidUntil")}
          </span>
          {isAdmin && onDelete && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              aria-label={t("analysis.predictionDeleteButton")}
              title={t("analysis.predictionDeleteButton")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        {/* Skor + kazanan */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("analysis.predictionWeightedScore")}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black tabular-nums text-foreground">{prediction.homeScore}</span>
              <span className="text-xl font-light text-muted-foreground">:</span>
              <span className="text-3xl font-black tabular-nums text-foreground">{prediction.awayScore}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
              {winnerLabel}
            </span>
            <span className={`text-[11px] font-semibold tabular-nums ${confidenceColor}`}>
              {t("analysis.predictionConfidence", { n: prediction.confidence })}
            </span>
          </div>
        </div>

        {/* Eleme turu — ilk ayak / toplam skor (agregat) / uzatma-penaltı */}
        {prediction.tie?.isKnockout && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5">
            {prediction.tie.firstLeg ? (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {t("analysis.predictionFirstLeg")}
                </span>
                <span className="font-bold tabular-nums text-foreground">
                  {prediction.tie.firstLeg.homeTeam} {prediction.tie.firstLeg.homeScore}-{prediction.tie.firstLeg.awayScore}{" "}
                  {prediction.tie.firstLeg.awayTeam}
                </span>
              </div>
            ) : prediction.tie.leg === 1 ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("analysis.predictionFirstLegPending")}
              </span>
            ) : null}

            {typeof prediction.tie.aggregateHome === "number" && typeof prediction.tie.aggregateAway === "number" && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {t("analysis.predictionAggregate")}
                </span>
                <span className="font-black tabular-nums text-primary">
                  {prediction.tie.aggregateHome} - {prediction.tie.aggregateAway}
                </span>
              </div>
            )}

            {prediction.tie.isDeciding && prediction.tie.advancing && (
              <span className="rounded-md border border-primary/25 bg-primary/8 px-2 py-1 text-[11px] font-bold text-primary">
                {prediction.tie.wentToPenalties
                  ? t("analysis.predictionPenalties", {
                      team: prediction.tie.advancing === "home" ? homeName : awayName,
                    })
                  : prediction.tie.wentToExtraTime
                    ? t("analysis.predictionExtraTime", {
                        team: prediction.tie.advancing === "home" ? homeName : awayName,
                      })
                    : t("analysis.predictionAdvancing", {
                        team: prediction.tie.advancing === "home" ? homeName : awayName,
                      })}
              </span>
            )}
          </div>
        )}

        {/* Ek tahminler */}
        <div className="flex flex-wrap gap-2">
          <span className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            prediction.btts
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/60 bg-secondary text-muted-foreground",
          )}>
            {prediction.btts ? t("analysis.predictionBttsYes") : t("analysis.predictionBttsNo")}
          </span>
          <span className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            prediction.overUnder === "over"
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/60 bg-secondary text-muted-foreground",
          )}>
            {prediction.overUnder === "over" ? t("analysis.predictionOverLabel") : t("analysis.predictionUnderLabel")}
          </span>
        </div>

        {/* Özet */}
        <p className="text-xs leading-relaxed text-muted-foreground">{displaySummary}</p>

        {/* Anahtar faktörler */}
        {displayKeyFactors.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {displayKeyFactors.map((factor, i) => (
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
              <span>{t("analysis.predictionShowVotes", { count: modelCount })}</span>
              {showVotes ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showVotes && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {visibleModelVotes.map((vote, i) => (
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

    {isAdmin && onDelete && (
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("analysis.predictionDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("analysis.predictionDeleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConfirmed()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : t("analysis.predictionDeleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    </>
  )
}
