"use client"

import { useState } from "react"
import { TrendingUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"
import type { PredictionResult } from "@/lib/types"

// Model etiket haritası — model string'inden okunabilir isim üret
function modelLabel(model: string): string {
  if (model.includes("gpt")) return "GPT-5.6 Terra"
  if (model.includes("gemini")) return "Gemini 3.6 Flash"
  if (model.includes("grok")) return "Grok 4.5"
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
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  const total = results.length
  const scoreHits = results.filter((r) => r.scoreCorrect).length
  const sideHits = results.filter((r) => r.sideCorrect).length
  const scoreRate = total > 0 ? Math.round((scoreHits / total) * 100) : 0
  const sideRate = total > 0 ? Math.round((sideHits / total) * 100) : 0

  const modelStats = buildModelStats(results)

  return (
    <section aria-label={t("successPanel.ariaLabel")} className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      {/* Ana satır — tıklanabilir */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
        aria-expanded={expanded}
      >
        {/* Sol: ikon + başlık + maç sayısı */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
        </span>

        <span className="text-sm font-semibold text-foreground">{t("successPanel.title")}</span>

        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {t("successPanel.matchesCount", { count: total })}
        </span>

        {/* Sağ: istatistikler + chevron */}
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          <StatChip label={t("successPanel.side")} hits={sideHits} total={total} rate={sideRate} />
          <StatChip label={t("successPanel.score")} hits={scoreHits} total={total} rate={scoreRate} />
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0", expanded && "rotate-180")}
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
              <div key={m.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-xs font-semibold text-foreground shrink-0 min-w-0 truncate max-w-[140px]">{m.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{t("successPanel.matchesCount", { count: m.total })}</span>
                <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
                  <StatChip label={t("successPanel.side")} hits={m.sideHits} total={m.total} rate={mSideRate} />
                  <StatChip label={t("successPanel.score")} hits={m.scoreHits} total={m.total} rate={mScoreRate} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {expanded && modelStats.length === 0 && (
        <div className="border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
          {t("successPanel.noModelData")}
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
