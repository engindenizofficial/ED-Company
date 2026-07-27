"use client"

import { LoaderCircle, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { ThemeToggle } from "@/components/theme-toggle"
import { fetcher } from "@/lib/fetcher"
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

const FIXTURES_SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateIfStale: true,
  dedupingInterval: 30_000,
  refreshInterval: 60_000,
} as const

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])

function analysisSwrOptions(fixture: Fixture | null) {
  const isLive = fixture ? LIVE_STATUSES.has(fixture.statusShort) : false
  return {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    dedupingInterval: isLive ? 25_000 : 60_000,
    refreshInterval: isLive ? 30_000 : 0,
  }
}

export default function Page() {
  const date = todayTR()
  const [selected, setSelected] = useState<Fixture | null>(null)
  const [query, setQuery] = useState("")
  const [fetchingIds, setFetchingIds] = useState<Set<number>>(new Set())
  const [prefetchedCount, setPrefetchedCount] = useState(0)

  const fixturesKey = `/api/fixtures?date=${date}`
  const analysisKey = selected ? `/api/analyze?fixtureId=${selected.id}` : null

  const { data: fixturesData, isLoading: fixturesLoading } = useSWR<FixturesResponse>(
    fixturesKey,
    fetcher,
    FIXTURES_SWR_OPTIONS,
  )

  const {
    data: analysis,
    error: analysisError,
    isLoading: analysisLoading,
  } = useSWR<AnalysisResponse>(analysisKey, fetcher, analysisSwrOptions(selected))

  const fixtures = useMemo(() => fixturesData?.fixtures ?? [], [fixturesData])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return fixtures
    return fixtures.filter((f) => buildSearchIndex(f).includes(q))
  }, [fixtures, query])

  // Sequential prefetch: fixtures yüklenince önce hangileri Redis'te var kontrol et,
  // cache'deki maçları hemen say, sadece eksik olanları 3s arayla çek.
  const fixtureSignature = fixtures.map((f) => f.id).join(",")
  const prefetchedSignatures = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!fixtureSignature) return
    if (prefetchedSignatures.current.has(fixtureSignature)) return
    prefetchedSignatures.current.add(fixtureSignature)

    let cancelled = false

    ;(async () => {
      // 1. Hangi fixture'lar zaten Redis'te cache'li?
      let alreadyCachedIds: Set<number> = new Set()
      try {
        const res = await fetch("/api/analyze/cached-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: fixtures.map((f) => f.id) }),
        })
        const data = await res.json()
        alreadyCachedIds = new Set<number>(data.cachedIds ?? [])
      } catch {
        // Redis erişilemiyorsa hepsini prefetch et
      }

      if (cancelled) return

      // 2. Cache'deki maçları hemen sayaca ekle
      setPrefetchedCount(alreadyCachedIds.size)

      // 3. Sadece cache'de olmayan maçları sırayla çek
      const missing = fixtures.filter((f) => !alreadyCachedIds.has(f.id))

      for (const f of missing) {
        if (cancelled) break
        setFetchingIds((s) => new Set([...s, f.id]))
        try {
          await fetch(`/api/analyze?fixtureId=${f.id}`)
        } catch {
          // Sorun değil, tıklandığında tekrar dener
        }
        setFetchingIds((s) => {
          const next = new Set(s)
          next.delete(f.id)
          return next
        })
        setPrefetchedCount((c) => c + 1)
        if (!cancelled) await new Promise<void>((r) => setTimeout(r, 3000))
      }
    })()

    return () => {
      cancelled = true
    }
  // fixtureSignature string'i fixtures'ın özeti, doğrudan dep olarak kullanılıyor
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureSignature])

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
            {fixtures.length > 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {fetchingIds.size > 0 ? (
                  <LoaderCircle className="h-3 w-3 animate-spin text-primary" />
                ) : null}
                Detaylı veri:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {prefetchedCount}/{fixtures.length}
                </span>
              </span>
            ) : null}
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
            fetchingIds={fetchingIds}
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
