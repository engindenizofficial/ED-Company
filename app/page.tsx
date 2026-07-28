"use client"

import { LoaderCircle, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { ThemeToggle } from "@/components/theme-toggle"
import { buildSearchIndex } from "@/lib/tr-aliases"
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

function normalize(s: string): string {
  return s.toLocaleLowerCase("tr-TR").trim()
}

export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)
  const [query, setQuery] = useState("")

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
      const res = await fetch(url)
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

  // Maç seçilince analizi cache'den çek (refresh=0)
  const loadAnalysis = useCallback(async (id: number, forceRefresh = false) => {
    setAnalysisLoading(true)
    setAnalysisError(undefined)
    try {
      const url = `/api/analyze?fixtureId=${id}${forceRefresh ? "&refresh=1" : ""}`
      const res = await fetch(url)
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
    // Maç seçilince önce cache'den göster
    loadAnalysis(selected.id, false)
  }, [selected, loadAnalysis])

  // Yenile butonu: tüm verileri API'den tazele, 6 saat cache'le
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await loadFixtures(true)
      if (selected) {
        await loadAnalysis(selected.id, true)
      }
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, loadFixtures, selected, loadAnalysis])

  const fixtures = useMemo(() => fixturesData?.fixtures ?? [], [fixturesData])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return fixtures
    return fixtures.filter((f) => buildSearchIndex(f).includes(q))
  }, [fixtures, query])

  const handleSelect = useCallback((f: Fixture) => {
    setSelected((cur) => (cur?.id === f.id ? null : f))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-[49px] z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-extrabold leading-none tracking-tight">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>{" "}
            <span className="text-foreground">Company</span>
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Verileri yenile"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Yenile
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold capitalize text-foreground">{formatDateLabel(date)}</h2>
            {!fixturesLoading ? (
              <span className="text-xs text-muted-foreground">{filtered.length} maç</span>
            ) : null}
          </div>

          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Takım, lig veya ülke ara..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              aria-label="Maçları filtrele"
            />
          </label>
        </div>

        {fixturesLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
            Maçlar yükleniyor...
          </div>
        ) : fixtures.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            Bu tarihte planlanmış maç bulunamadı.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            {'"'}
            {query}
            {'"'} için sonuç bulunamadı.
          </div>
        ) : (
          <FixtureList
            fixtures={filtered}
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
