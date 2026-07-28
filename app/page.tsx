"use client"

import { LoaderCircle, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])

/** SSE stream'den gelen analiz verisini dinler, anlık günceller. */
function useAnalysisStream(fixtureId: number | null) {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Seçili maç yoksa temizle
    if (!fixtureId) {
      esRef.current?.close()
      esRef.current = null
      setData(null)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setData(null)

    function connect() {
      if (cancelled) return

      const es = new EventSource(`/api/analyze/stream?fixtureId=${fixtureId}`)
      esRef.current = es

      es.addEventListener("analysis", (e) => {
        if (cancelled) return
        try {
          const parsed = JSON.parse(e.data) as AnalysisResponse
          setData(parsed)
          setIsLoading(false)
          setError(null)
        } catch {
          // parse hatası — görmezden gel
        }
      })

      es.addEventListener("error", () => {
        es.close()
        if (!cancelled) {
          retryTimeout.current = setTimeout(connect, 5_000)
        }
      })
    }

    connect()

    return () => {
      cancelled = true
      esRef.current?.close()
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
    }
  }, [fixtureId])

  return { data: data ?? undefined, isLoading, error: error ?? undefined }
}

/** SSE stream'den gelen fixture verilerini dinler, anlık günceller. */
function useFixturesStream() {
  const [fixturesData, setFixturesData] = useState<FixturesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let cancelled = false

    function connect() {
      if (cancelled) return

      const es = new EventSource("/api/fixtures/stream")
      esRef.current = es

      es.addEventListener("fixtures", (e) => {
        if (cancelled) return
        try {
          const data = JSON.parse(e.data) as FixturesResponse
          setFixturesData(data)
          setIsLoading(false)
        } catch {
          // parse hatası — görmezden gel
        }
      })

      es.addEventListener("error", () => {
        es.close()
        if (!cancelled) {
          // 5 saniye sonra yeniden bağlan
          retryTimeout.current = setTimeout(connect, 5_000)
        }
      })
    }

    connect()

    return () => {
      cancelled = true
      esRef.current?.close()
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
    }
  }, [])

  return { fixturesData, isLoading }
}

export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)
  const [query, setQuery] = useState("")

  const { fixturesData, isLoading: fixturesLoading } = useFixturesStream()

  const {
    data: analysis,
    error: analysisError,
    isLoading: analysisLoading,
  } = useAnalysisStream(selected?.id ?? null)

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
