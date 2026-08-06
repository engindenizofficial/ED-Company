"use client"

import { CheckCircle2, XCircle, Target, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PredictionResult } from "@/lib/types"

function winnerLabel(w: "home" | "away" | "draw", homeName: string, awayName: string): string {
  if (w === "home") return homeName
  if (w === "away") return awayName
  return "Beraberlik"
}

export function SuccessPanel({ results }: { results: PredictionResult[] }) {
  const total = results.length
  const scoreHits = results.filter((r) => r.scoreCorrect).length
  const sideHits = results.filter((r) => r.sideCorrect).length

  const scoreRate = total > 0 ? Math.round((scoreHits / total) * 100) : 0
  const sideRate = total > 0 ? Math.round((sideHits / total) * 100) : 0

  return (
    <section
      aria-label="Tahmin başarı paneli"
      className="rounded-2xl border border-border/70 bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/30 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">Tahmin Başarısı</span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-muted-foreground">
          {total} maç
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
        {/* Skor başarısı */}
        <div className="flex flex-col items-center gap-1 px-6 py-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Skor Tahmini
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-black tabular-nums text-foreground">{scoreHits}</span>
            <span className="mb-0.5 text-sm font-medium text-muted-foreground">/ {total}</span>
          </div>
          <RateBar rate={scoreRate} />
          <span className="text-xs font-semibold text-primary">%{scoreRate}</span>
        </div>

        {/* Taraf başarısı */}
        <div className="flex flex-col items-center gap-1 px-6 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Taraf Tahmini
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-black tabular-nums text-foreground">{sideHits}</span>
            <span className="mb-0.5 text-sm font-medium text-muted-foreground">/ {total}</span>
          </div>
          <RateBar rate={sideRate} />
          <span className="text-xs font-semibold text-primary">%{sideRate}</span>
        </div>
      </div>

      {/* Results list */}
      <ul className="divide-y divide-border/40">
        {results.map((r) => (
          <ResultRow key={r.fixtureId} result={r} />
        ))}
      </ul>
    </section>
  )
}

function RateBar({ rate }: { rate: number }) {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          rate >= 70
            ? "bg-primary"
            : rate >= 40
            ? "bg-yellow-500"
            : "bg-destructive",
        )}
        style={{ width: `${rate}%` }}
        role="progressbar"
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

function ResultRow({ result }: { result: PredictionResult }) {
  const {
    homeName,
    awayName,
    predictedHome,
    predictedAway,
    predictedWinner,
    actualHome,
    actualAway,
    actualWinner,
    scoreCorrect,
    sideCorrect,
  } = result

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 text-sm">
      {/* Takım adları */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="truncate font-semibold text-foreground">{homeName}</span>
        <span className="truncate text-xs text-muted-foreground">{awayName}</span>
      </div>

      {/* Skor karşılaştırması */}
      <div className="flex flex-col items-center gap-2">
        {/* Gerçek skor */}
        <div className="flex items-center gap-1.5">
          <span className="text-base font-black tabular-nums text-foreground">
            {actualHome} : {actualAway}
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
            MS
          </span>
        </div>

        {/* Tahmin edilen skor */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-sm tabular-nums font-semibold",
              scoreCorrect ? "text-primary" : "text-muted-foreground",
            )}
          >
            {predictedHome} : {predictedAway}
          </span>
          <span className="text-[10px] text-muted-foreground/60">tahmin</span>
        </div>
      </div>

      {/* Taraf + ikonlar */}
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[11px] text-muted-foreground/70 font-medium">
          {winnerLabel(actualWinner, homeName, awayName)}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Skor ikonu */}
          <span
            className={cn(
              "flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold",
              scoreCorrect
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive",
            )}
            title={scoreCorrect ? "Skor tahmini doğru" : "Skor tahmini yanlış"}
          >
            {scoreCorrect ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            Skor
          </span>

          {/* Taraf ikonu */}
          <span
            className={cn(
              "flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold",
              sideCorrect
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive",
            )}
            title={`Tahmin: ${winnerLabel(predictedWinner, homeName, awayName)}`}
          >
            {sideCorrect ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            Taraf
          </span>
        </div>
      </div>
    </li>
  )
}
