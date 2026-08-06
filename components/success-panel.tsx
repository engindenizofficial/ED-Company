"use client"

import { useState } from "react"
import { TrendingUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PredictionResult } from "@/lib/types"

// Model etiket haritası — model string'inden okunabilir isim üret
function modelLabel(model: string): string {
  if (model.includes("gpt")) return "GPT-5.6 Terra"
  if (model.includes("gemini")) return "Gemini 3.5 Flash"
  if (model.includes("grok")) return "Grok 3 Mini"
  return model
}

interface ModelStat {
  label: string
  total: number
  scoreHits: number
  sideHits: number
}

function buildModelStats(results: PredictionResult[]): ModelStat[] {
  const map = new Map<string, ModelStat>()

  for (const r of results) {
    if (!r.modelResults?.length) continue
    for (const m of r.modelResults) {
      const key = m.label || m.model
      if (!map.has(key)) {
        map.set(key, { label: modelLabel(m.model), total: 0, scoreHits: 0, sideHits: 0 })
      }
      const stat = map.get(key)!
      stat.total++
      if (m.scoreCorrect) stat.scoreHits++
      if (m.sideCorrect) stat.sideHits++
    }
  }

  return Array.from(map.values())
}

export function SuccessPanel({ results }: { results: PredictionResult[] }) {
  const [expanded, setExpanded] = useState(false)

  const total = results.length
  const scoreHits = results.filter((r) => r.scoreCorrect).length
  const sideHits = results.filter((r) => r.sideCorrect).length
  const scoreRate = total > 0 ? Math.round((scoreHits / total) * 100) : 0
  const sideRate = total > 0 ? Math.round((sideHits / total) * 100) : 0

  const modelStats = buildModelStats(results)

  return (
    <section aria-label="Tahmin başarı paneli" className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      {/* Ana satır — tıklanabilir */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
        </span>

        <span className="text-sm font-semibold text-foreground">Tahmin Başarısı</span>

        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {total} maç
        </span>

        {/* Özet istatistikler */}
        <div className="ml-auto flex items-center gap-4">
          <StatChip label="Taraf" hits={sideHits} total={total} rate={sideRate} />
          <StatChip label="Skor" hits={scoreHits} total={total} rate={scoreRate} />
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")}
          />
        </div>
      </button>

      {/* Açılır bölüm — AI bazlı doğruluk */}
      {expanded && modelStats.length > 0 && (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {modelStats.map((m) => {
            const mSideRate = m.total > 0 ? Math.round((m.sideHits / m.total) * 100) : 0
            const mScoreRate = m.total > 0 ? Math.round((m.scoreHits / m.total) * 100) : 0
            return (
              <div key={m.label} className="flex items-center gap-4 px-4 py-3">
                <span className="w-36 text-xs font-semibold text-foreground shrink-0">{m.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{m.total} maç</span>
                <div className="ml-auto flex items-center gap-4">
                  <StatChip label="Taraf" hits={m.sideHits} total={m.total} rate={mSideRate} />
                  <StatChip label="Skor" hits={m.scoreHits} total={m.total} rate={mScoreRate} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {expanded && modelStats.length === 0 && (
        <div className="border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
          Model bazlı veriler mevcut değil — daha eski tahminlerde model oyu kaydedilmemiş.
        </div>
      )}
    </section>
  )
}

function StatChip({ label, hits, total, rate }: { label: string; hits: number; total: number; rate: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <span className="text-xs font-bold tabular-nums text-foreground">
        {hits}/{total}
      </span>
      <span
        className={cn(
          "text-[10px] font-semibold tabular-nums",
          rate >= 60 ? "text-primary" : rate >= 40 ? "text-yellow-500" : "text-destructive",
        )}
      >
        %{rate}
      </span>
    </div>
  )
}
