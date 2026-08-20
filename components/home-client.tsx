"use client"

import { LoaderCircle, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { SuccessPanel } from "@/components/success-panel"
import { TeamSearchBar } from "@/components/team-search-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useFavorites } from "@/contexts/favorites-context"
import { useLanguage } from "@/contexts/language-context"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useCloseOnBackButton } from "@/hooks/use-close-on-back-button"
import { useSwipeToClose } from "@/hooks/use-swipe-to-close"
import { PanelDragHandle } from "@/components/panel-drag-handle"
import { useSession } from "@/lib/auth-client"
import { isAdminEmail } from "@/lib/admin"
import { cn } from "@/lib/utils"
import type { Fixture, FixturesResponse, MatchPrediction, PredictionResult } from "@/lib/types"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

// Türkiye saatiyle dünün tarihini döndürür (YYYY-MM-DD). Gece 00:00'da
// (TR saatiyle) hem bu hem de todayTR() otomatik olarak bir gün kayar.
function yesterdayTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() - 1)
  return trNow.toLocaleDateString("sv-SE")
}

// Türkiye saatiyle yarının tarihini döndürür (YYYY-MM-DD). Gece 00:00'da
// (TR saatiyle) todayTR() ile birlikte otomatik olarak bir gün kayar.
function tomorrowTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() + 1)
  return trNow.toLocaleDateString("sv-SE")
}

function formatDateLabel(iso: string, locale: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

// Statü grupları
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])
const LIVE_OR_FINISHED = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE", "FT", "AET", "PEN", "AWD", "WO"])
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"])

function actualWinner(homeGoals: number, awayGoals: number): "home" | "away" | "draw" {
  if (homeGoals > awayGoals) return "home"
  if (awayGoals > homeGoals) return "away"
  return "draw"
}

interface HomeClientProps {
  /**
   * /mac/[id] sayfasından (paylaşılan link / direkt ziyaret) geldiğimizde
   * dolu olur. Bugünün fikstür listesinde bu ID varsa oradan seçilir; yoksa
   * (maç bugün oynanmıyorsa) tek başına /api/fixtures/[id] üzerinden çekilir.
   */
  initialFixtureId?: number
}

export function HomeClient({ initialFixtureId }: HomeClientProps) {
  // Kullanıcının ana sayfadan geçiş yapabildiği "Dün" / "Bugün" / "Yarın"
  // sekmesi. Her üç tarih de TR saatiyle hesaplanır, gece 00:00'da (TR
  // saati) otomatik olarak bir gün kayar.
  const [dateTab, setDateTab] = useState<"yesterday" | "today" | "tomorrow">("today")
  const date = dateTab === "yesterday" ? yesterdayTR() : dateTab === "tomorrow" ? tomorrowTR() : todayTR()
  const router = useRouter()
  const { favorites } = useFavorites()
  const { t, locale } = useLanguage()
  const { data: session } = useSession()
  const isAdmin = isAdminEmail(session?.user?.email)
  const [selected, setSelected] = useState<Fixture | null>(null)

  const [fixturesData, setFixturesData] = useState<FixturesResponse | null>(null)
  const [fixturesLoading, setFixturesLoading] = useState(true)

  const [prediction, setPrediction] = useState<MatchPrediction | null>(null)
  const [predictionLoading, setPredictionLoading] = useState(false)

  const [predictionResults, setPredictionResults] = useState<PredictionResult[]>([])

  const [refreshing, setRefreshing] = useState(false)
  // handleRefresh'in kimliğini (referansını) refreshing state'inden bağımsız tutmak için ref
  // kullanıyoruz. Aksi halde her yenilemede refreshing true/false arasında değiştiği için
  // handleRefresh yeniden oluşuyor, bu da aşağıdaki 30 saniyelik interval'in her seferinde
  // temizlenip yeniden kurulmasına ve sayacın sıfırdan başlamasına yol açıyordu — bu yüzden
  // gerçek yenileme aralığı 30 saniyeden, o anki fetch süresi kadar daha uzun sürüyordu.
  const isRefreshingRef = useRef(false)

  // Hangi fixtureId'ler için sonuç zaten kaydedildi (çift kayıt önlemi)
  const savedResultIds = useRef<Set<number>>(new Set())

  // /mac/[id] üzerinden geldiysek, o ID zaten (tekli fetch ile) açıldı mı?
  const openedInitialRef = useRef(false)

  // İlk yüklemede cache'den fikstürleri çek (refresh=0).
  // "Maçlar yükleniyor" animasyonu sadece ilk yüklemede gösterilir —
  // arka planda otomatik yenilenirken (fixturesData zaten varsa) liste
  // sessizce güncellenir, kullanıcı bir yükleniyor ekranı görmez.
  const loadFixtures = useCallback(async (forceRefresh = false) => {
    setFixturesData((current) => {
      if (current === null) setFixturesLoading(true)
      return current
    })
    try {
      const url = `/api/fixtures?date=${date}${forceRefresh ? "&refresh=1" : ""}`
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json() as FixturesResponse
      setFixturesData(data)
    } catch {
      // sessizce geç
    } finally {
      setFixturesLoading(false)
    }
  }, [date])

  // Kullanıcı "Dün" / "Bugün" sekmesini değiştirdiğinde (dolayısıyla `date`
  // değiştiğinde) fikstür listesini o tarih için yeniden yükler. `useAutoRefresh`
  // aşağıda sadece mount'ta ve 30 saniyelik döngüde çalışır — `date` değişimini
  // tek başına yakalamaz, bu yüzden ayrı bir effect gerekiyor. İlk mount'ta da
  // çalışır ama bu zararsızdır (aynı isteği `useAutoRefresh` da atar, ikisi de
  // cache'den okuduğu için ekstra maliyeti yoktur).
  useEffect(() => {
    loadFixtures(false)
  }, [loadFixtures])

  // Tüm zamanlar tahmin sonuçlarını çek
  const loadPredictionResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/prediction-results?all=1`, { cache: "no-store" })
      const data = await res.json() as { results: PredictionResult[] }
      if (data.results) {
        setPredictionResults(data.results)
        data.results.forEach((r) => savedResultIds.current.add(r.fixtureId))
      }
    } catch {
      // sessizce geç
    }
  }, [])

  // Sayfa açılışında bitmiş maçları otomatik kontrol et:
  // Redis'te tahmini varsa skoru karşılaştır ve panele ekle.
  // Tahmini yoksa hiçbir şey yapma.
  const autoCheckFinished = useCallback(async (fixtures: Fixture[]) => {
    const finished = fixtures.filter((f) => FINISHED_STATUSES.has(f.statusShort))
    if (finished.length === 0) return

    await Promise.allSettled(
      finished.map(async (fixture) => {
        if (savedResultIds.current.has(fixture.id)) return

        // Sadece cache'den tahmin çek — yeni tahmin oluşturma
        let pred: MatchPrediction | null = null
        try {
          const res = await fetch(`/api/predict/cached?fixtureId=${fixture.id}`, { cache: "no-store" })
          if (res.ok) pred = (await res.json()) as MatchPrediction
        } catch {
          return
        }

        if (!pred) return // Bu maç için kayıtlı tahmin yok, geç

        const homeGoals = fixture.goalsHome
        const awayGoals = fixture.goalsAway
        if (homeGoals == null || awayGoals == null) return

        const winner = actualWinner(homeGoals, awayGoals)

        try {
          const res = await fetch("/api/prediction-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fixtureId: fixture.id,
              homeName: fixture.home.name,
              awayName: fixture.away.name,
              predictedHome: pred.homeScore,
              predictedAway: pred.awayScore,
              predictedWinner: pred.winner,
              actualHome: homeGoals,
              actualAway: awayGoals,
              actualWinner: winner,
              confidence: pred.confidence,
              modelVotes: pred.modelVotes ?? [],
            }),
            cache: "no-store",
          })
          if (res.ok) {
            savedResultIds.current.add(fixture.id)
            const data = (await res.json()) as { ok: boolean; result: PredictionResult }
            if (data.ok) {
              setPredictionResults((prev) => {
                if (prev.some((r) => r.fixtureId === fixture.id)) return prev
                return [...prev, data.result]
              })
            }
          }
        } catch {
          // sessizce geç
        }
      }),
    )
  }, [])

  // Fikstürler yüklenince otomatik kontrol başlat
  useEffect(() => {
    if (!fixturesLoading && fixturesData) {
      autoCheckFinished(fixturesData.fixtures ?? [])
    }
  }, [fixturesLoading, fixturesData, autoCheckFinished])

  // Tahmin yükleme — her durumda sadece cache'den okur, yeni tahmin oluşturmaz
  const loadPrediction = useCallback(async (fixture: Fixture) => {
    setPredictionLoading(true)
    setPrediction(null)
    try {
      const res = await fetch(`/api/predict/cached?fixtureId=${fixture.id}`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json() as MatchPrediction
        setPrediction(data)
      } else {
        setPrediction(null)
      }
    } catch {
      setPrediction(null)
    } finally {
      setPredictionLoading(false)
    }
  }, [])

  // Kullanıcı "Tahmin Al" butonuna basınca çağrılır — yeni tahmin üretir
  const triggerPrediction = useCallback(async () => {
    if (!selected || !PREDICTABLE_STATUSES.has(selected.statusShort)) return
    setPredictionLoading(true)
    setPrediction(null)
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: selected.id }),
        cache: "no-store",
      })
      if (!res.ok) throw new Error("Tahmin alınamadı")
      const data = await res.json() as MatchPrediction
      setPrediction(data)
    } catch {
      setPrediction(null)
    } finally {
      setPredictionLoading(false)
    }
  }, [selected])

  // Admin "tahmini sil" butonu — tahmini cache'ten, bekleyen listeden ve
  // başarı panelinden (günlük + tüm zamanlar) komple siler. Sadece admin
  // e-postasıyla giriş yapılmışsa AnalysisPanel bu callback'i kullanıma açar.
  const handleDeletePrediction = useCallback(async () => {
    if (!selected) return
    const res = await fetch(`/api/predict?fixtureId=${selected.id}`, {
      method: "DELETE",
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Tahmin silinemedi")

    setPrediction(null)
    savedResultIds.current.delete(selected.id)
    setPredictionResults((prev) => prev.filter((r) => r.fixtureId !== selected.id))
  }, [selected])

  // Tahmin hazır olduğunda, bitmiş maçlar için otomatik sonuç kaydet
  const saveResultIfNeeded = useCallback(async (
    fixture: Fixture,
    pred: MatchPrediction | null,
  ) => {
    if (!pred) return
    if (!FINISHED_STATUSES.has(fixture.statusShort)) return
    if (savedResultIds.current.has(fixture.id)) return

    const homeGoals = fixture.goalsHome
    const awayGoals = fixture.goalsAway

    if (homeGoals == null || awayGoals == null) return

    const winner = actualWinner(homeGoals, awayGoals)

    try {
      const res = await fetch("/api/prediction-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fixture.id,
          homeName: fixture.home.name,
          awayName: fixture.away.name,
          predictedHome: pred.homeScore,
          predictedAway: pred.awayScore,
          predictedWinner: pred.winner,
          actualHome: homeGoals,
          actualAway: awayGoals,
          actualWinner: winner,
          confidence: pred.confidence,
          modelVotes: pred.modelVotes ?? [],
        }),
        cache: "no-store",
      })
      if (res.ok) {
        savedResultIds.current.add(fixture.id)
        // Başarı panelini güncelle
        const data = await res.json() as { ok: boolean; result: PredictionResult }
        if (data.ok) {
          setPredictionResults((prev) => {
            const idx = prev.findIndex((r) => r.fixtureId === fixture.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = data.result
              return next
            }
            return [...prev, data.result]
          })
        }
      }
    } catch {
      // sessizce geç
    }
  }, [])

  // Sadece gerçekten farklı bir maça geçildiğinde tahmini yeniden yükleriz.
  // "selected" objesi 30 saniyelik otomatik yenilemede aynı maç için de yeni
  // bir referansla güncellenir (bkz. fixturesData senkron effect'i aşağıda);
  // id aynı kalırken bu effect'i tekrar tetiklemek, AI tahmin kartını her
  // yenilemede "hazırlanıyor" spinner'ına düşürüp animasyonun geri gelmesine
  // yol açıyordu. Diğer bölümler (maç olayları, istatistikler vb.) sessiz
  // yenileme kuralına uyarken bu kart uymuyordu — id bazlı kontrolle eşitliyoruz.
  const loadedPredictionFixtureIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!selected) {
      loadedPredictionFixtureIdRef.current = null
      setPrediction(null)
      return
    }
    if (loadedPredictionFixtureIdRef.current === selected.id) return
    loadedPredictionFixtureIdRef.current = selected.id
    loadPrediction(selected)
  }, [selected, loadPrediction])

  // Tahmin hazır olduğunda bitmiş maçlar için sonuç kaydet
  useEffect(() => {
    if (!selected) return
    if (predictionLoading) return
    saveResultIfNeeded(selected, prediction)
  }, [selected, prediction, predictionLoading, saveResultIfNeeded])


  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    setRefreshing(true)
    try {
      // Bekleyen tahminleri kontrol et (geçmiş tarihlerdekiler dahil)
      const checkRes = await fetch("/api/predict/pending-check", { method: "POST", cache: "no-store" })
      if (checkRes.ok) {
        const { resolved } = await checkRes.json() as { resolved: PredictionResult[] }
        if (resolved.length > 0) {
          setPredictionResults((prev) => {
            const next = [...prev]
            for (const r of resolved) {
              const idx = next.findIndex((x) => x.fixtureId === r.fixtureId)
              if (idx >= 0) next[idx] = r
              else next.push(r)
            }
            return next
          })
        }
      }
      await Promise.all([loadFixtures(true), loadPredictionResults()])
    } finally {
      isRefreshingRef.current = false
      setRefreshing(false)
    }
  }, [loadFixtures, loadPredictionResults])

  // Yenileme yaşam döngüsü — ortak `useAutoRefresh` hook'undaki 3 kural:
  // 1) Sayfa ilk açıldığında bir kez otomatik yenilenir.
  // 2) Sekme görünürken 30 saniyede bir otomatik yenilenir.
  // 3) Sekme arka plana geçince durur; kullanıcı sekmeye geri döndüğünde
  //    hemen bir kez daha yenilenir ve döngü yeniden başlar.
  // Aynı hook, canlı maç panelindeki skor/dakika ile maç olayları / oyuncu
  // performansları / maç istatistikleri sekmelerinde de kullanılıyor.
  useAutoRefresh(handleRefresh, true)

  // Fikstür listesi her yenilendi��inde, o an açık olan maç paneli (varsa)
  // da aynı listeden gelen en güncel fixture nesnesiyle senkronize edilir.
  // Bunu yapmazsak "selected" ilk tıklandığı andaki skor/dakika bilgisinde
  // donuk kalır — panel açıkken 30 saniyelik otomatik yenilemeler fixturesData'yı
  // güncellese de panelin kendi state'i hiç güncellenmezdi. Bugünün listesinde
  // olmayan bir maç (örn. /mac/[id] ile tekli fetch edilmiş) burada
  // bulunamazsa mevcut "selected" değeri korunur, sıfırlanmaz.
  useEffect(() => {
    if (!fixturesData) return
    setSelected((cur) => {
      if (!cur) return cur
      const updated = fixturesData.fixtures?.find((f) => f.id === cur.id)
      return updated ?? cur
    })
  }, [fixturesData])

  // /mac/[id] ile geldiysek: önce bugünün fikstür listesinde ara, orada
  // yoksa (maç bugün oynanmıyorsa) tek başına çek. Bu, initialFixtureId
  // değişmediği sürece (aynı sayfada başka bir maça tıklanmadığı sürece)
  // sadece bir kez çalışır.
  useEffect(() => {
    if (!initialFixtureId || openedInitialRef.current) return

    const fromList = fixturesData?.fixtures?.find((f) => f.id === initialFixtureId)
    if (fromList) {
      openedInitialRef.current = true
      setSelected(fromList)
      return
    }

    // Bugünün listesi henüz yüklenmediyse bekle (fixturesLoading true).
    if (fixturesLoading) return

    // Liste yüklendi ama maç bu listede yok — tek başına çek.
    openedInitialRef.current = true
    fetch(`/api/fixtures/${initialFixtureId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Fixture>) : null))
      .then((fixture) => {
        if (fixture) setSelected(fixture)
        else router.replace("/")
      })
      .catch(() => router.replace("/"))
  }, [initialFixtureId, fixturesData, fixturesLoading, router])

  useBodyScrollLock(!!selected)
  useCloseOnBackButton(
    !!selected,
    () => {
      setSelected(null)
      // /mac/[id] üzerinden geldiysek (direkt ziyaret/paylaşılan link) panel
      // kapatılınca adres çubuğunu da "/" a döndürüyoruz — bkz.
      // hooks/use-close-on-back-button.ts'deki "alreadyAtUrl" davranışı:
      // bu durumda history.back() çağrılmaz, URL değişikliği bize kalır.
      if (initialFixtureId) router.replace("/")
    },
    selected ? `/mac/${selected.id}` : undefined,
  )

  const closeSelected = useCallback(() => setSelected(null), [])
  const { style: swipeStyle, handlers: swipeHandlers } = useSwipeToClose(closeSelected)

  const fixtures = useMemo(() => fixturesData?.fixtures ?? [], [fixturesData])

  const handleSelect = useCallback((f: Fixture) => {
    setSelected((cur) => (cur?.id === f.id ? null : f))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="sticky top-[49px] z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-5">
          {/* Top row: date label + actions */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {t("home.todayMatches")}
                </span>
                <h1 className="text-sm font-bold capitalize text-foreground leading-tight">
                  {formatDateLabel(date, locale)}
                </h1>
              </div>
              {!fixturesLoading && (
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {t("home.matchesCount", { count: fixtures.length })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>

          {/* Date tab row: Yesterday / Today */}
          <div className="pb-3">
            <div
              role="tablist"
              aria-label={t("home.dateTabLabel")}
              className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-card p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={dateTab === "yesterday"}
                onClick={() => setDateTab("yesterday")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  dateTab === "yesterday"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("home.dateTabYesterday")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dateTab === "today"}
                onClick={() => setDateTab("today")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  dateTab === "today"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("home.dateTabToday")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dateTab === "tomorrow"}
                onClick={() => setDateTab("tomorrow")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  dateTab === "tomorrow"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("home.dateTabTomorrow")}
              </button>
            </div>
          </div>

          {/* Search row */}
          <div className="pb-3">
            <TeamSearchBar />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-5">
        {/* Başarı paneli — sonuç varsa göster */}
        {predictionResults.length > 0 && (
          <SuccessPanel results={predictionResults} />
        )}

        {fixturesLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card py-16 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs font-medium tracking-wide">{t("home.loadingMatches")}</span>
          </div>
        ) : fixtures.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-16 text-center text-sm text-muted-foreground">
            {t("home.noMatchesToday")}
          </div>
        ) : (
          <FixtureList
            fixtures={fixtures}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            favorites={favorites}
          />
        )}
      </main>

      {/* Match panel — full screen */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.home.name} - ${selected.away.name} ${t("home.matchAnalysis")}`}
          style={swipeStyle}
        >
          {/* Top bar — aşağı sürüklenerek panel kapatılabilir (mobil) */}
          <div className="flex shrink-0 flex-col border-b border-border bg-card" {...swipeHandlers}>
            <PanelDragHandle />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {selected.home.name} – {selected.away.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">{selected.league.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t("common.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <AnalysisPanel
              fixture={selected}
              prediction={prediction}
              predictionLoading={predictionLoading}
              onPredict={triggerPrediction}
              isAdmin={isAdmin}
              onDeletePrediction={handleDeletePrediction}
            />
          </div>
        </div>
      )}
    </div>
  )
}
