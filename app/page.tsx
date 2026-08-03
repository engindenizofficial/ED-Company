"use client"

import { LoaderCircle, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { TeamSearchBar } from "@/components/team-search-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import type { AnalysisResponse, Fixture, FixturesResponse } from "@/lib/types"

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


export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)

  const [fixturesData, setFixturesData] = useState<FixturesResponse | null>(null)
  const [fixturesLoading, setFixturesLoading] = useState(true)

  const [analysis, setAnalysis] = useState<AnalysisResponse | undefined>(undefined)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<Error | undefined>(undefined)

  const [refreshing, setRefreshing] = useState(false)

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

  // İlk yükleme — cache'den gelir, API çağrısı yapılmaz
  useEffect(() => {
    loadFixtures(false)
  }, [loadFixtures])

  // Maç paneli açılınca her seferinde API'den taze veri çek — kaydedilmez, cache kullanılmaz
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

  useEffect(() => {
    if (!selected) {
      setAnalysis(undefined)
      setAnalysisError(undefined)
      return
    }
    // Panel her açıldığında API'den taze çek
    loadAnalysis(selected.id)
  }, [selected, loadAnalysis])

  // Yenile butonu: sadece fikstür listesini günceller, açık analiz paneline dokunmaz
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await loadFixtures(true)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, loadFixtures])

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

      <main className="mx-auto flex max-w-4xl flex-col gap-0 px-5 py-5">
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
              />
            )}
          />
        )}
      </main>
    </div>
  )
}
