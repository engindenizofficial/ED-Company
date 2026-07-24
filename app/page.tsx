"use client"

import { ChevronLeft, ChevronRight, DatabaseZap, LoaderCircle, RefreshCw, Search, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { ThemeToggle } from "@/components/theme-toggle"
import { fetcher, networkFetch } from "@/lib/fetcher"
import { buildSearchIndex } from "@/lib/tr-aliases"
import type { AnalysisResponse, FixtureWithPrediction, FixturesResponse, GeminiPrediction } from "@/lib/types"

function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

function offsetDate(base: string, delta: number): string {
  const d = new Date(base + "T12:00:00")
  d.setDate(d.getDate() + delta)
  return d.toLocaleDateString("sv-SE")
}

function formatDateLabel(iso: string): string {
  const today = todayTR()
  const tomorrow = offsetDate(today, 1)
  const yesterday = offsetDate(today, -1)
  if (iso === today) return "Bugün"
  if (iso === tomorrow) return "Yarın"
  if (iso === yesterday) return "Dün"
  return new Date(iso + "T12:00:00").toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatLongDate(iso: string): string {
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

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP", "HT"])

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60 * 60 * 1000,
} as const

type CardScore = { home: number; away: number; winner: "home" | "draw" | "away" }

// Centered date pill for date navigator
function DatePill({
  iso,
  active,
  onClick,
}: {
  iso: string
  active: boolean
  onClick: () => void
}) {
  const label = formatDateLabel(iso)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      style={
        active
          ? {
              background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
              boxShadow: "var(--shadow-card-active)",
            }
          : {
              background: "var(--secondary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
            }
      }
    >
      {label}
    </button>
  )
}

export default function Page() {
  const today = todayTR()
  const [date, setDate] = useState(today)
  const [selected, setSelected] = useState<FixtureWithPrediction | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const [cardScores, setCardScores] = useState<Record<number, CardScore>>({})
  const cardScoresRef = useRef<Record<number, CardScore>>({})
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const inFlight = useRef<Set<number>>(new Set())

  // Generate 7-day window: yesterday + today + 5 days ahead
  const dateWindow = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => offsetDate(today, i - 1))
  }, [today])

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

  const liveCount = useMemo(
    () => fixtures.filter((f) => LIVE_STATUSES.has(f.statusShort)).length,
    [fixtures],
  )

  const totalGoals = useMemo(
    () =>
      fixtures.reduce((sum, f) => {
        const h = f.goalsHome ?? 0
        const a = f.goalsAway ?? 0
        if (f.statusShort !== "NS" && f.statusShort !== "TBD") return sum + h + a
        return sum
      }, 0),
    [fixtures],
  )

  useEffect(() => {
    cardScoresRef.current = cardScores
  }, [cardScores])

  useEffect(() => {
    if (fixturesData?.cachedAt) setLastUpdated(formatStamp(fixturesData.cachedAt))
  }, [fixturesData])

  // Clear selection when date changes
  useEffect(() => {
    setSelected(null)
    setQuery("")
  }, [date])

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
    }).catch(() => {})
  }, [fixtures, date])

  const PREDICTIONS_DISABLED = true
  useEffect(() => {
    if (PREDICTIONS_DISABLED) return
    if (filtered.length === 0) return
    const queue = filtered
      .filter((f) => !f.predictedScore && !cardScoresRef.current[f.id] && !inFlight.current.has(f.id))
      .map((f) => f.id)
    if (queue.length === 0) return
    let cancelled = false
    const markPending = (id: number, on: boolean) => {
      setPendingIds((prev) => {
        const next = new Set(prev)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    }
    async function runQueue() {
      for (const id of queue) {
        if (cancelled) break
        if (inFlight.current.has(id)) continue
        inFlight.current.add(id)
        markPending(id, true)
        const fixture = filtered.find((f) => f.id === id)
        try {
          const res = await fetch("/api/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fixture }),
          }).then((r) => r.json() as Promise<{ prediction: GeminiPrediction }>)
          if (!cancelled && res?.prediction) {
            setCardScores((prev) => ({
              ...prev,
              [id]: {
                home: res.prediction.score.home,
                away: res.prediction.score.away,
                winner: res.prediction.winner,
              },
            }))
          }
        } catch {}
        finally {
          inFlight.current.delete(id)
          markPending(id, false)
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, 3000))
      }
    }
    runQueue()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const merged = useMemo<FixtureWithPrediction[]>(() => {
    return filtered.map((f) => {
      if (f.predictedScore) return f
      const cs = cardScores[f.id]
      if (cs) return { ...f, predictedScore: { home: cs.home, away: cs.away }, predictedWinner: cs.winner }
      return f
    })
  }, [filtered, cardScores])

  const handleSelect = useCallback(
    (f: FixtureWithPrediction) => {
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
        } catch {}
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
      {/* Page header */}
      <header
        className="sticky top-[49px] z-10 border-b border-border bg-background/95 backdrop-blur-md"
        style={{ boxShadow: "var(--shadow-nav)" }}
      >
        <div className="mx-auto max-w-4xl px-4 py-2.5">
          {/* Top row: date label + actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <h1 className="text-sm font-extrabold capitalize text-foreground">{formatLongDate(date)}</h1>
              {!fixturesLoading && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {lastUpdated && <span>Son güncelleme: {lastUpdated}</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {refreshError ? (
                <span
                  className="hidden items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 sm:flex dark:text-amber-400"
                  title={refreshError}
                >
                  <DatabaseZap className="h-3.5 w-3.5" />
                  Kayıtlı veri
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                aria-label="Verileri yenile"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
              </button>
              <ThemeToggle />
            </div>
          </div>

          {/* Date navigator */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setDate((d) => offsetDate(d, -1))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
              style={{ boxShadow: "var(--shadow-card)" }}
              aria-label="Önceki gün"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dateWindow.map((d) => (
                <DatePill
                  key={d}
                  iso={d}
                  active={d === date}
                  onClick={() => setDate(d)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDate((d) => offsetDate(d, 1))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
              style={{ boxShadow: "var(--shadow-card)" }}
              aria-label="Sonraki gün"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5">
        {/* Stats summary strip */}
        {!fixturesLoading && fixtures.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <StatPill label="Toplam Maç" value={fixtures.length.toString()} />
            <StatPill
              label="Canlı"
              value={liveCount.toString()}
              live={liveCount > 0}
            />
            <StatPill label="Toplam Gol" value={totalGoals.toString()} icon={<Zap className="h-3 w-3" />} />
          </div>
        )}

        {/* Search */}
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Takım, lig veya ülke ara..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Maçları filtrele"
            style={{ boxShadow: "var(--shadow-card)" }}
          />
        </label>

        {/* Fixture list or states */}
        {fixturesLoading ? (
          <div
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-14 text-sm text-muted-foreground"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
            Maçlar yükleniyor...
          </div>
        ) : fixtures.length === 0 ? (
          <div
            className="rounded-xl border border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            Bu tarihte planlanmış maç bulunamadı.
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-xl border border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {'"'}
            {query}
            {'"'} için sonuç bulunamadı.
          </div>
        ) : (
          <FixtureList
            fixtures={merged}
            selectedId={selected?.id ?? null}
            pendingIds={pendingIds}
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

function StatPill({
  label,
  value,
  live = false,
  icon,
}: {
  label: string
  value: string
  live?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-3"
      style={{
        background: live
          ? "color-mix(in oklch, var(--live) 12%, var(--card))"
          : "var(--card)",
        border: live
          ? "1px solid color-mix(in oklch, var(--live) 35%, var(--border))"
          : "1px solid var(--border)",
        boxShadow: live ? "var(--glow-live)" : "var(--shadow-card)",
      }}
    >
      <div className="flex items-center gap-1">
        {icon}
        {live && value !== "0" && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        )}
        <span
          className={`text-lg font-extrabold tabular-nums ${live && value !== "0" ? "text-live" : "text-foreground"}`}
          style={{ color: live && value !== "0" ? "var(--live)" : undefined }}
        >
          {value}
        </span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  )
}
