"use client"

import { CalendarDays, DatabaseZap, LoaderCircle, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { ThemeToggle } from "@/components/theme-toggle"
import { lastGoodTimestamp, writeLastGood } from "@/lib/cache"
import { fetcher, networkFetch } from "@/lib/fetcher"
import type { AnalysisResult, Fixture, FixturesResponse } from "@/lib/types"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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

// Options that stop SWR from auto-refetching. Data is served from the persisted
// last-good store; the network is only hit on an explicit refresh.
const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60 * 60 * 1000,
} as const

export default function Page() {
  const [date, setDate] = useState<string>(todayISO())
  const [selected, setSelected] = useState<Fixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [simulating, setSimulating] = useState(false)
  const simTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fixturesKey = `/api/fixtures?date=${date}`
  const analysisKey = selected ? `/api/analyze?fixtureId=${selected.id}` : null

  const {
    data: fixturesData,
    error: fixturesError,
    isLoading: fixturesLoading,
    mutate,
  } = useSWR<FixturesResponse>(fixturesKey, fetcher, SWR_OPTIONS)

  const {
    data: analysis,
    error: analysisError,
    isLoading: analysisLoading,
    mutate: mutateAnalysis,
  } = useSWR<AnalysisResult>(analysisKey, fetcher, SWR_OPTIONS)

  const fixtures = fixturesData?.fixtures ?? []

  // Live text filter across team, league and country names.
  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return fixtures
    return fixtures.filter((f) => {
      return (
        normalize(f.home.name).includes(q) ||
        normalize(f.away.name).includes(q) ||
        normalize(f.league.name).includes(q) ||
        normalize(f.league.country).includes(q)
      )
    })
  }, [fixtures, query])

  // Show when the currently displayed fixtures were last pulled from the API.
  useEffect(() => {
    const ts = lastGoodTimestamp(fixturesKey)
    setLastUpdated(
      ts
        ? new Date(ts).toLocaleString("tr-TR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    )
  }, [fixturesKey, fixturesData])

  useEffect(() => {
    return () => {
      if (simTimer.current) clearTimeout(simTimer.current)
    }
  }, [])

  // Accordion select with a short "AI is simulating" animation window.
  const handleSelect = useCallback(
    (f: Fixture) => {
      if (simTimer.current) clearTimeout(simTimer.current)
      if (selected?.id === f.id) {
        setSelected(null)
        setSimulating(false)
        return
      }
      setSelected(f)
      setSimulating(true)
      simTimer.current = setTimeout(() => setSimulating(false), 1500)
    },
    [selected],
  )

  // Refresh button: THE ONLY place that hits the network. It forces a live
  // request, and only overwrites the stored data when the request succeeds — so
  // if the API is rate limited/down we keep showing the last real data.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const freshFixtures = await networkFetch<FixturesResponse>(fixturesKey)
      writeLastGood(fixturesKey, freshFixtures)
      await mutate(freshFixtures, { revalidate: false })

      if (analysisKey) {
        try {
          const freshAnalysis = await networkFetch<AnalysisResult>(analysisKey)
          writeLastGood(analysisKey, freshAnalysis)
          await mutateAnalysis(freshAnalysis, { revalidate: false })
        } catch {
          // Keep the previously stored analysis; the fixtures still refreshed.
        }
      }

      // The server returns real data even when the API is rate limited — it just
      // flags it as stale. Surface a warning but keep showing that real data.
      if (freshFixtures.stale) {
        setRefreshError("API limiti dolu — en son çekilen gerçek veriler gösteriliyor")
      }

      const stamp = freshFixtures.cachedAt ?? Date.now()
      setLastUpdated(
        new Date(stamp).toLocaleString("tr-TR", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      )
    } catch (err) {
      // No stored data at all (server never had a success) — keep whatever is on
      // screen and warn.
      setRefreshError(err instanceof Error ? err.message : "Canlı veri alınamadı")
    } finally {
      setRefreshing(false)
    }
  }, [fixturesKey, analysisKey, mutate, mutateAnalysis])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-extrabold leading-none tracking-tight">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>{" "}
            <span className="text-foreground">Company</span>
          </h1>
          <div className="flex items-center gap-2">
            {refreshError ? (
              <span
                className="hidden items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 sm:flex dark:text-amber-400"
                title={`Canlı veriye ulaşılamadı (${refreshError}). En son API'den çekilen veriler gösteriliyor.`}
              >
                <DatabaseZap className="h-3.5 w-3.5" />
                Son çekilen veri
              </span>
            ) : null}
            <label className="relative flex items-center">
              <CalendarDays className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setSelected(null)
                }}
                className="rounded-lg border border-border bg-card py-1.5 pl-8 pr-2 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Tarih seç"
              />
            </label>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
              aria-label="Maçları yenile (canlı istek at)"
              title="Canlı veriyi yeniden çek"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        {refreshError ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Canlı veriye ulaşılamadı, en son API&apos;den çekilen gerçek veriler gösteriliyor. Tekrar denemek için
              sağ üstteki yenileme tuşuna basın.
            </span>
          </div>
        ) : null}

        {/* Date + search */}
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

        {/* Fixtures + inline accordion analysis */}
        {fixturesLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
            Maçlar yükleniyor...
          </div>
        ) : fixturesError ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-8 text-center">
            <p className="text-sm font-medium text-destructive">Maçlar yüklenemedi</p>
            <p className="text-xs text-muted-foreground">{(fixturesError as Error).message}</p>
          </div>
        ) : fixtures.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            Bu tarihte planlanmış maç bulunamadı. Farklı bir tarih deneyin.
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
                isLoading={simulating || analysisLoading}
                error={analysisError as Error | undefined}
              />
            )}
          />
        )}
      </main>
    </div>
  )
}
