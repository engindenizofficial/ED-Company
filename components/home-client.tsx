"use client"

import { LoaderCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { FixtureList } from "@/components/fixture-list"
import { SuccessPanel } from "@/components/success-panel"
import { TeamSearchBar } from "@/components/team-search-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useFavorites } from "@/contexts/favorites-context"
import { useLanguage } from "@/contexts/language-context"
import { useMatchPanel } from "@/contexts/match-context"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
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
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"])

function actualWinner(homeGoals: number, awayGoals: number): "home" | "away" | "draw" {
  if (homeGoals > awayGoals) return "home"
  if (awayGoals > homeGoals) return "away"
  return "draw"
}

interface HomeClientProps {
  // Sunucuda (app/page.tsx / app/mac/[id]/page.tsx) önceden çekilmiş
  // "bugün" fikstür verisi. Verilirse HomeClient ilk render'da bu veriyle
  // başlar ve fixturesLoading'i false olarak kurar — bu sayede "Maçlar
  // yükleniyor" animasyonu ilk açılışta hiç görünmez, site direkt dolu
  // haliyle açılır. Sekmeler arası geçişte veya arka planda yenilemede
  // davranış değişmez, sadece ilk mount'taki boş/yükleniyor anı ortadan
  // kalkar.
  initialFixturesData?: FixturesResponse
}

export function HomeClient({ initialFixturesData }: HomeClientProps = {}) {
  // Kullanıcının ana sayfadan geçiş yapabildiği "Dün" / "Bugün" / "Yarın"
  // sekmesi. Her üç tarih de TR saatiyle hesaplanır, gece 00:00'da (TR
  // saati) otomatik olarak bir gün kayar.
  const [dateTab, setDateTab] = useState<"yesterday" | "today" | "tomorrow">("today")
  const date = dateTab === "yesterday" ? yesterdayTR() : dateTab === "tomorrow" ? tomorrowTR() : todayTR()
  const { favorites } = useFavorites()
  const { t, locale } = useLanguage()
  // Maç paneli artık global bir context'te (MatchContext, kök layout'ta
  // sağlanır) yaşıyor — bkz. components/match-panel.tsx. Bu sayede takım/lig
  // panelinden bir maça tıklamak da aynı paneli açabiliyor.
  const { panel: matchPanel, openMatch, closeMatch, syncFixture } = useMatchPanel()

  // initialFixturesData sadece "bugün" tarihi için geçerlidir (sunucu her
  // zaman todayTR() için çeker). Kullanıcı "Dün"/"Yarın" sekmesindeyken
  // sayfayı ilk kez açarsa (örn. deep link) bu veri o tarihle eşleşmez —
  // bu yüzden başlangıç state'i sadece dateTab hâlâ "today" ise kullanılır.
  const [fixturesData, setFixturesData] = useState<FixturesResponse | null>(
    initialFixturesData ?? null,
  )
  const [fixturesLoading, setFixturesLoading] = useState(!initialFixturesData)

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

  // Ekranda gösterilen fixturesData hangi tarihe ait, onu tutar. "Maçlar
  // yükleniyor" animasyonu sadece istenen tarih henüz ekranda değilse
  // (ilk yükleme veya sekme değişimi) gösterilir — arka planda otomatik
  // yenilenirken (aynı tarih için, fixturesData zaten güncelse) liste
  // sessizce güncellenir, kullanıcı bir yükleniyor ekranı görmez.
  //
  // Önceden bu kontrol sadece `fixturesData === null` olup olmadığına
  // bakıyordu; bu yüzden "Dün/Bugün/Yarın" sekmesi değiştirildiğinde eski
  // tarihin listesi ekranda donuk kalıyor, yeni veri gelene kadar hiçbir
  // görsel geri bildirim olmuyordu (kullanıcıya "birkaç saniye hiçbir şey
  // olmuyor, sonra birden değişiyor" hissi veriyordu).
  const loadedDateRef = useRef<string | null>(initialFixturesData?.date ?? null)

  const loadFixtures = useCallback(async (forceRefresh = false) => {
    const requestedDate = date
    if (loadedDateRef.current !== requestedDate) {
      setFixturesLoading(true)
    }
    try {
      const url = `/api/fixtures?date=${requestedDate}${forceRefresh ? "&refresh=1" : ""}`
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json() as FixturesResponse
      setFixturesData(data)
      loadedDateRef.current = requestedDate
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

  // Fikstür listesi her yenilendiğinde, o an açık olan maç paneli (varsa)
  // da aynı listeden gelen en güncel fixture nesnesiyle senkronize edilir —
  // bu mantık artık MatchContext'in syncFixture metoduna taşındı. Bunu
  // yapmazsak panel ilk tıklandığı andaki skor/dakika bilgisinde donuk kalır
  // — panel açıkken 30 saniyelik otomatik yenilemeler fixturesData'yı
  // güncellese de panelin kendi state'i hiç güncellenmezdi. Bugünün
  // listesinde olmayan bir maç (örn. /mac/[id] ile tekli fetch edilmiş)
  // burada bulunamazsa mevcut panel değeri korunur, sıfırlanmaz.
  useEffect(() => {
    if (!fixturesData) return
    syncFixture(fixturesData.fixtures ?? [])
  }, [fixturesData, syncFixture])

  const fixtures = useMemo(() => fixturesData?.fixtures ?? [], [fixturesData])

  const handleSelect = useCallback((f: Fixture) => {
    if (matchPanel?.fixture.id === f.id) {
      closeMatch()
      return
    }
    openMatch(f)
  }, [matchPanel, openMatch, closeMatch])

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      {/* relative + z-20: "backdrop-blur-md" kendi stacking context'ini yarattığı
          için (CSS spec'inde filter/backdrop-filter bunu tetikler) z-index'i
          "auto" kalan bu header, DOM'da sonra gelen <main> (fikstür listesi)
          tarafından ÜSTÜNE çizilebiliyordu — arama kutusu açık dropdown'ı bu
          yüzden altta kalan maç kartlarıyla karışık/bulaşık görünüyordu.
          Açık pozitif z-index (nav-tabs.tsx'teki sticky header'la aynı desen)
          header'ın (ve içindeki dropdown'ın) her zaman main'in üzerinde
          çizilmesini garantiler. */}
      <header className="relative z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
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
              {/* relative + before:-inset-y-* : görsel pill boyutu (py-1) aynı kalır,
                  ama gerçek dokunma alanı dikeyde ~44px'e çıkar (Lighthouse
                  "dokunma hedefleri yeterli boyuta sahip değil" uyarısı). */}
              <button
                type="button"
                role="tab"
                aria-selected={dateTab === "yesterday"}
                onClick={() => setDateTab("yesterday")}
                className={cn(
                  "relative rounded-full px-3 py-1 text-xs font-semibold transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
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
                  "relative rounded-full px-3 py-1 text-xs font-semibold transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
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
                  "relative rounded-full px-3 py-1 text-xs font-semibold transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
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
            selectedId={matchPanel?.fixture.id ?? null}
            onSelect={handleSelect}
            favorites={favorites}
          />
        )}
      </main>
    </div>
  )
}
