"use client"

import { DatabaseZap, LoaderCircle, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { ThemeToggle } from "@/components/theme-toggle"
import { fetcher, networkFetch } from "@/lib/fetcher"
import { buildSearchIndex } from "@/lib/tr-aliases"
import type { AnalysisResponse, Fixture, FixturesResponse } from "@/lib/types"

// Türkiye saatiyle bugünün tarihini döndürür (YYYY-MM-DD).
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

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60 * 60 * 1000,
} as const

export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const fixturesKey = `/api/fixtures?date=${date}`
  const analysisKey = selected ? `/api/analyze?fixtureId=${selected.id}` : null

  const {
    data: fixturesData,
    isLoading: fixturesLoading,
    mutate,
  } = useSWR<FixturesResponse>(fixturesKey, fetcher, SWR_OPTIONS)

  const {
    data: analysis,
    error: analysisError,
    isLoading: analysisLoading,
    mutate: mutateAnalysis,
  } = useSWR<AnalysisResponse>(analysisKey, fetcher, SWR_OPTIONS)

  const fixtures = useMemo(() => fixturesData?.fixtures ?? [], [fixturesData])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return fixtures
    return fixtures.filter((f) => buildSearchIndex(f).includes(q))
  }, [fixtures, query])

  useEffect(() => {
    if (fixturesData?.cachedAt) setLastUpdated(formatStamp(fixturesData.cachedAt))
  }, [fixturesData])

  const prefetchedDates = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (fixtures.length === 0) return
    if (prefetchedDates.current.has(date)) return

    prefetchedDates.current.add(date)

    const ids = fixtures.map((f) => f.id)

    fetch("/api/prefetch-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureIds: ids }),
    })
      .then((r) => r.json())
      .then((res) => {
        console.log("[v0] prefetch-live tamamlandı:", res)
      })
      .catch((err) => {
        console.log("[v0] prefetch-live hata:", err instanceof Error ? err.message : err)
      })
  }, [fixtures, date])

  const handleSelect = useCallback(
    (f: Fixture) => {
      setSelected((cur) => (cur?.id === f.id ? null : f))
    },
    [],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const freshFixtures = await networkFetch<FixturesResponse>(`${fixturesKey}&refresh=1`)
      await mutate(freshFixtures, { revalidate: false })

      if (analysisKey) {
        try {
          const freshAnalysis = await networkFetch<AnalysisResponse>(`${analysisKey}&refresh=1`)
          await mutateAnalysis(freshAnalysis, { revalidate: false })
        } catch {
          // Keep the previously shown analysis.
        }
      }

      if (freshFixtures.stale) {
        setRefreshError("API limiti dolu — en son kaydedilen gerçek veriler gösteriliyor")
      }
      setLastUpdated(formatStamp(freshFixtures.cachedAt ?? Date.now()))
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Canlı veri alınamadı")
    } finally {
      setRefreshing(false)
    }
  }, [fixturesKey, analysisKey, mutate, mutateAnalysis])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-[49px] z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-extrabold leading-none tracking-tight">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>{" "}
            <span className="text-foreground">Company</span>
          </h1>
          <div className="flex items-center gap-2">
            {refreshError ? (
              <span
                className="hidden items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 sm:flex dark:text-amber-400"
                title={`Canlı veriye ulaşılamadı (${refreshError}).`}
              >
                <DatabaseZap className="h-3.5 w-3.5" />
                Kayıtlı veri
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
              aria-label="Canlı verileri yenile"
              title="Canlı veriyi yeniden çek"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {lastUpdated ? <span>Son güncelleme: {lastUpdated}</span> : null}
                <span>{filtered.length} maç</span>
              </div>
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
