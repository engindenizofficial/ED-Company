"use client"

import { LoaderCircle, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { SuccessPanel } from "@/components/success-panel"
import { TeamSearchBar } from "@/components/team-search-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import type { AnalysisResponse, Fixture, FixturesResponse, MatchPrediction, PredictionResult } from "@/lib/types"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

function formatDateLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("tr-TR", {
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

export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)

  const [fixturesData, setFixturesData] = useState<FixturesResponse | null>(null)
  const [fixturesLoading, setFixturesLoading] = useState(true)

  const [analysis, setAnalysis] = useState<AnalysisResponse | undefined>(undefined)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<Error | undefined>(undefined)

  const [prediction, setPrediction] = useState<MatchPrediction | null>(null)
  const [predictionLoading, setPredictionLoading] = useState(false)

  const [predictionResults, setPredictionResults] = useState<PredictionResult[]>([])

  const [refreshing, setRefreshing] = useState(false)

  // Hangi fixtureId'ler için sonuç zaten kaydedildi (çift kayıt önlemi)
  const savedResultIds = useRef<Set<number>>(new Set())

  // İlk yüklemede cache'den fikstürleri çek (refresh=0)
  const loadFixtures = useCallback(async (forceRefresh = false) => {
    setFixturesLoading(true)
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

  // Günün tahmin sonuçlarını çek
  const loadPredictionResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/prediction-results?date=${date}`, { cache: "no-store" })
      const data = await res.json() as { date: string; results: PredictionResult[] }
      if (data.results) {
        setPredictionResults(data.results)
        // Zaten kaydedilmiş ID'leri işaretle
        data.results.forEach((r) => savedResultIds.current.add(r.fixtureId))
      }
    } catch {
      // sessizce geç
    }
  }, [date])

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

  // İlk yükleme
  useEffect(() => {
    loadFixtures(false)
    loadPredictionResults()
  }, [loadFixtures, loadPredictionResults])

  // Fikstürler yüklenince otomatik kontrol başlat
  useEffect(() => {
    if (!fixturesLoading && fixturesData) {
      autoCheckFinished(fixturesData.fixtures ?? [])
    }
  }, [fixturesLoading, fixturesData, autoCheckFinished])

  // Maç paneli açılınca her seferinde API'den taze veri çek
  const loadAnalysis = useCallback(async (id: number) => {
    setAnalysisLoading(true)
    setAnalysisError(undefined)
    try {
      const res = await fetch(`/api/analyze?fixtureId=${id}&t=${Date.now()}`, { cache: "no-store" })
      const data = await res.json() as AnalysisResponse
      setAnalysis(data)
    } catch (e) {
      setAnalysisError(e instanceof Error ? e : new Error("Bir hata oluştu"))
    } finally {
      setAnalysisLoading(false)
    }
  }, [])

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

  // Analiz verisi ve tahmin hazır olduğunda, bitmiş maçlar için otomatik sonuç kaydet
  const saveResultIfNeeded = useCallback(async (
    fixture: Fixture,
    pred: MatchPrediction | null,
    analysisData: AnalysisResponse | undefined,
  ) => {
    if (!pred) return
    if (!FINISHED_STATUSES.has(fixture.statusShort)) return
    if (savedResultIds.current.has(fixture.id)) return

    // Skoru analiz verisinden veya fikstür verisinden al
    const homeGoals = analysisData?.live?.fixture?.goalsHome ?? fixture.goalsHome
    const awayGoals = analysisData?.live?.fixture?.goalsAway ?? fixture.goalsAway

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

  useEffect(() => {
    if (!selected) {
      setAnalysis(undefined)
      setAnalysisError(undefined)
      setPrediction(null)
      return
    }
    loadAnalysis(selected.id)
    loadPrediction(selected)
  }, [selected, loadAnalysis, loadPrediction])

  // Analiz + tahmin her ikisi de hazır olduğunda bitmiş maçlar için sonuç kaydet
  useEffect(() => {
    if (!selected) return
    if (analysisLoading || predictionLoading) return
    saveResultIfNeeded(selected, prediction, analysis)
  }, [selected, prediction, analysis, analysisLoading, predictionLoading, saveResultIfNeeded])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([loadFixtures(true), loadPredictionResults()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, loadFixtures, loadPredictionResults])

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
                  Günün Maçları
                </span>
                <h1 className="text-sm font-bold capitalize text-foreground leading-tight">
                  {formatDateLabel(date)}
                </h1>
              </div>
              {!fixturesLoading && (
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {fixtures.length} maç
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Verileri yenile"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-all hover:border-primary/50 hover:text-primary disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                Yenile
              </button>
              <ThemeToggle />
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
            <span className="text-xs font-medium tracking-wide">Maçlar yükleniyor</span>
          </div>
        ) : fixtures.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-16 text-center text-sm text-muted-foreground">
            Bu tarihte planlanmış maç bulunamadı.
          </div>
        ) : (
          <FixtureList
            fixtures={fixtures}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            renderExpanded={() => (
              <AnalysisPanel
                data={analysis}
                isLoading={analysisLoading}
                error={analysisError as Error | undefined}
                prediction={prediction}
                predictionLoading={predictionLoading}
                onPredict={triggerPrediction}
              />
            )}
          />
        )}
      </main>
    </div>
  )
}
