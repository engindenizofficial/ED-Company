"use client"

import { CalendarDays, DatabaseZap, LoaderCircle, RefreshCw, Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { cacheTimestamp, clearCache } from "@/lib/cache"
import { fetcher } from "@/lib/fetcher"
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

// Options that stop SWR from auto-refetching. Data is served from the 1h
// localStorage cache; the network is only hit on an explicit refresh.
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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

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
  } = useSWR<AnalysisResult>(analysisKey, fetcher, SWR_OPTIONS)

  const fixtures = fixturesData?.fixtures ?? []
  const usingMock = fixturesData?.source === "mock" || analysis?.source === "mock"

  // Show when the currently displayed fixtures were cached.
  useEffect(() => {
    const ts = cacheTimestamp(fixturesKey)
    setLastUpdated(
      ts
        ? new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        : null,
    )
  }, [fixturesKey, fixturesData])

  // Refresh button: clear caches, then force a fresh network request.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    clearCache(fixturesKey)
    if (analysisKey) clearCache(analysisKey)
    try {
      await Promise.all([mutate(), analysisKey ? undefined : Promise.resolve()])
    } finally {
      setRefreshing(false)
    }
  }, [fixturesKey, analysisKey, mutate])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-bold leading-tight text-foreground">AI Teknik Direktör</h1>
              <p className="text-xs text-muted-foreground">İstatistiksel Maç Analiz Motoru</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {usingMock ? (
              <span
                className="hidden items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 sm:flex dark:text-amber-400"
                title="Canlı API'ye ulaşılamadı, yedek verilerle çalışılıyor."
              >
                <DatabaseZap className="h-3.5 w-3.5" />
                Yedek veri
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
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Fixtures column */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold capitalize text-foreground">{formatDateLabel(date)}</h2>
            {!fixturesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {lastUpdated ? <span>Son güncelleme: {lastUpdated}</span> : null}
                <span>{fixtures.length} maç</span>
              </div>
            ) : null}
          </div>

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
          ) : (
            <FixtureList fixtures={fixtures} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}
        </section>

        {/* Analysis column */}
        <section className="lg:sticky lg:top-20 lg:self-start">
          <AnalysisPanel
            data={analysis}
            isLoading={analysisLoading}
            error={analysisError as Error | undefined}
          />
        </section>
      </main>
    </div>
  )
}
