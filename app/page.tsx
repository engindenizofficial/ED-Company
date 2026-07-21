"use client"

import { CalendarDays, LoaderCircle, RefreshCw, Sparkles } from "lucide-react"
import { useState } from "react"
import useSWR from "swr"
import { AnalysisPanel } from "@/components/analysis-panel"
import { FixtureList } from "@/components/fixture-list"
import { fetcher } from "@/lib/fetcher"
import type { AnalysisResult, Fixture } from "@/lib/types"

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

export default function Page() {
  const [date, setDate] = useState<string>(todayISO())
  const [selected, setSelected] = useState<Fixture | null>(null)

  const {
    data: fixturesData,
    error: fixturesError,
    isLoading: fixturesLoading,
    mutate,
  } = useSWR<{ date: string; fixtures: Fixture[] }>(`/api/fixtures?date=${date}`, fetcher, {
    revalidateOnFocus: false,
  })

  const {
    data: analysis,
    error: analysisError,
    isLoading: analysisLoading,
  } = useSWR<AnalysisResult>(selected ? `/api/analyze?fixtureId=${selected.id}` : null, fetcher, {
    revalidateOnFocus: false,
  })

  const fixtures = fixturesData?.fixtures ?? []

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
              onClick={() => mutate()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              aria-label="Maçları yenile"
            >
              <RefreshCw className="h-4 w-4" />
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
              <span className="text-xs text-muted-foreground">{fixtures.length} maç</span>
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
