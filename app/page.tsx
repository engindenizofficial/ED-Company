"use client"

import { CalendarDays, DatabaseZap, KeyRound, LoaderCircle, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { KeysModal, type ApiKeys } from "@/components/keys-modal"
import { ThemeToggle } from "@/components/theme-toggle"
import { fetcher, networkFetch } from "@/lib/fetcher"
import { buildSearchIndex } from "@/lib/tr-aliases"
import type { AnalysisResponse, FixtureWithPrediction, FixturesResponse, GeminiPrediction } from "@/lib/types"

const KEYS_STORAGE_KEY = "ed_api_keys"

function loadKeys(): ApiKeys {
  if (typeof window === "undefined") return { apiFootballKey: "", geminiKey: "" }
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY)
    if (!raw) return { apiFootballKey: "", geminiKey: "" }
    return JSON.parse(raw) as ApiKeys
  } catch {
    return { apiFootballKey: "", geminiKey: "" }
  }
}

function saveKeys(keys: ApiKeys) {
  try {
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys))
  } catch { /* ignore */ }
}

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

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// SWR reads from Redis-backed routes; no auto-refetch. The refresh button is the
// only thing that pulls fresh live data.
const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60 * 60 * 1000,
} as const

// Score prediction shown on cards. { home, away } from server, or client map.
type CardScore = { home: number; away: number; winner: "home" | "draw" | "away" }

export default function Page() {
  const [keys, setKeys] = useState<ApiKeys>({ apiFootballKey: "", geminiKey: "" })
  const [keysModalOpen, setKeysModalOpen] = useState(false)
  const [keysReady, setKeysReady] = useState(false)

  // On mount: load saved keys; open modal if any key is missing.
  useEffect(() => {
    const saved = loadKeys()
    setKeys(saved)
    if (!saved.apiFootballKey || !saved.geminiKey) {
      setKeysModalOpen(true)
    } else {
      setKeysReady(true)
    }
  }, [])

  const handleKeysSave = useCallback((newKeys: ApiKeys) => {
    saveKeys(newKeys)
    setKeys(newKeys)
    setKeysReady(true)
  }, [])

  const [date, setDate] = useState<string>(todayISO())
  const [selected, setSelected] = useState<FixtureWithPrediction | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Client-generated card scores (fixtures that had no locked prediction yet).
  const [cardScores, setCardScores] = useState<Record<number, CardScore>>({})
  const cardScoresRef = useRef<Record<number, CardScore>>({})
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const inFlight = useRef<Set<number>>(new Set())

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

  // Keep ref in sync with state so the queue can read it without a stale closure.
  useEffect(() => {
    cardScoresRef.current = cardScores
  }, [cardScores])

  // Reset per-date generation bookkeeping when the date changes.
  useEffect(() => {
    setCardScores({})
    cardScoresRef.current = {}
    setPendingIds(new Set())
    inFlight.current = new Set()
  }, [date])

  // Update the "last updated" label from the payload timestamp.
  useEffect(() => {
    if (fixturesData?.cachedAt) setLastUpdated(formatStamp(fixturesData.cachedAt))
  }, [fixturesData])

  // Generate locked Gemini score predictions for fixtures that don't have one
  // yet. Runs strictly one-at-a-time in screen order with a 3-second pause
  // between requests so we never flood the Gemini API. Once a prediction is
  // stored in Redis it is never re-requested, so the delay only applies to
  // the very first generation globally.
  useEffect(() => {
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
        } catch {
          // Leave without a score; card shows a subtle dash.
        } finally {
          inFlight.current.delete(id)
          markPending(id, false)
        }

        // 3-second gap between requests to avoid Gemini rate limits.
        if (!cancelled) await new Promise((r) => setTimeout(r, 3000))
      }
    }

    runQueue()

    return () => {
      cancelled = true
    }
  // cardScoresRef is a ref — reading it inside the effect doesn't require it
  // as a dependency. We only re-run when the fixture list itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  // Merge server + client predicted scores onto the fixtures for the list.
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

  // Refresh: pull fresh LIVE data from API-Football. Gemini predictions stay
  // locked and are NOT regenerated.
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
      <KeysModal
        open={keysModalOpen}
        onClose={() => setKeysModalOpen(false)}
        onSave={handleKeysSave}
        initialKeys={keys}
      />
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
                title={`Canlı veriye ulaşılamadı (${refreshError}).`}
              >
                <DatabaseZap className="h-3.5 w-3.5" />
                Kayıtlı veri
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
              aria-label="Canlı verileri yenile"
              title="Canlı veriyi yeniden çek (tahminler kilitli kalır)"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setKeysModalOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              aria-label="API anahtarlarını düzenle"
              title="API anahtarlarını düzenle"
            >
              <KeyRound className="h-4 w-4" />
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
