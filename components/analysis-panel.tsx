"use client"

import { Flame, Goal, Handshake, LoaderCircle, Sparkles, Swords, Target, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"
import type { AnalysisResult, TeamForm } from "@/lib/types"
import { FormBadge } from "./form-badge"
import { ProbabilityBar } from "./probability-bar"

export function AnalysisPanel({
  data,
  isLoading,
  error,
}: {
  data: AnalysisResult | undefined
  isLoading: boolean
  error: Error | undefined
}) {
  if (isLoading) {
    return <AnalyzingState />
  }

  if (error) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-semibold text-destructive">Analiz yapılamadı</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <p className="max-w-xs text-balance text-sm">
          AI motoru bu maç için skor tahmini, kazanma yüzdeleri ve taktiksel rapor hazırlıyor.
        </p>
      </div>
    )
  }

  const { fixture, homeForm, awayForm, h2h, prediction } = data
  const verdictName =
    prediction.verdict === "home"
      ? fixture.home.name
      : prediction.verdict === "away"
        ? fixture.away.name
        : "Beraberlik"

  return (
    <div className="flex flex-col gap-6">
      {/* Match header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {fixture.league.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fixture.league.logo || "/placeholder.svg"} alt="" className="h-4 w-4 object-contain" />
          ) : null}
          <span>
            {fixture.league.name} · {fixture.league.round}
          </span>
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <TeamHeader name={fixture.home.name} logo={fixture.home.logo} />
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-3xl font-bold tabular-nums text-foreground">
              <span>{prediction.mostLikelyScore.home}</span>
              <span className="text-muted-foreground">-</span>
              <span>{prediction.mostLikelyScore.away}</span>
            </div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Tahmini skor
            </span>
          </div>
          <TeamHeader name={fixture.away.name} logo={fixture.away.logo} />
        </div>
      </div>

      {/* Verdict + confidence */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Öne çıkan tahmin">
          <span className="text-lg font-bold text-foreground">{verdictName}</span>
        </StatCard>
        <StatCard icon={<Target className="h-4 w-4" />} label="Güven skoru">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary" style={{ width: `${prediction.confidence}%` }} />
            </div>
            <span className="text-lg font-bold tabular-nums text-primary">%{prediction.confidence}</span>
          </div>
        </StatCard>
      </div>

      {/* Win probability */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Kazanma Olasılıkları</h2>
        <ProbabilityBar
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          homePct={prediction.homeWinPct}
          drawPct={prediction.drawPct}
          awayPct={prediction.awayWinPct}
        />
      </section>

      {/* Goal markets */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat icon={<Goal className="h-4 w-4" />} label="Beklenen gol (Ev)" value={prediction.expectedGoalsHome} />
        <MiniStat icon={<Goal className="h-4 w-4" />} label="Beklenen gol (Dep)" value={prediction.expectedGoalsAway} />
        <MiniStat icon={<Flame className="h-4 w-4" />} label="2.5 Üst" value={`%${prediction.over25Pct}`} />
        <MiniStat icon={<Handshake className="h-4 w-4" />} label="KG Var" value={`%${prediction.bttsPct}`} />
      </div>

      {/* AI Report */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">AI Teknik Direktör Raporu</h2>
        </div>
        <div className="flex flex-col gap-3">
          {prediction.report.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* Likely scores */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">En Olası Skorlar</h2>
        <div className="flex flex-wrap gap-2">
          {prediction.topScores.map((s, i) => (
            <div
              key={`${s.home}-${s.away}`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                i === 0 ? "border-primary bg-primary/10" : "border-border bg-secondary"
              }`}
            >
              <span className="text-sm font-bold tabular-nums text-foreground">
                {s.home}-{s.away}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">%{s.probability}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Form comparison */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Form Karşılaştırması</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TeamFormCard form={homeForm} label="Ev Sahibi" />
          <TeamFormCard form={awayForm} label="Deplasman" />
        </div>
      </section>

      {/* H2H */}
      {h2h.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Swords className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Aralarındaki Son Maçlar</h2>
          </div>
          <ul className="flex flex-col gap-2">
            {h2h.map((g, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {g.home ? "Ev" : "Dep"} · vs {g.opponent}
                </span>
                <span className="font-bold tabular-nums text-foreground">
                  {g.scored}-{g.conceded}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Tahminler istatistiksel modelleme sonucudur ve yatırım/bahis tavsiyesi değildir.
      </p>
    </div>
  )
}

const ANALYZING_STEPS = [
  "Veriler işleniyor...",
  "Form ivmeleri hesaplanıyor...",
  "10.000 senaryo simüle ediliyor...",
  "AI raporu yazılıyor...",
]

function AnalyzingState() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % ANALYZING_STEPS.length)
    }, 450)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 py-4 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <LoaderCircle className="h-14 w-14 animate-spin text-primary" strokeWidth={1.5} />
        <Sparkles className="absolute h-5 w-5 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">AI Teknik Direktör analiz ediyor</p>
        <p key={step} className="animate-in fade-in text-xs text-muted-foreground duration-300">
          {ANALYZING_STEPS[step]}
        </p>
      </div>
    </div>
  )
}

function TeamHeader({ name, logo }: { name: string; logo: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo || "/placeholder.svg"} alt={name} className="h-12 w-12 object-contain" />
      ) : null}
      <span className="text-sm font-semibold text-balance text-foreground">{name}</span>
    </div>
  )
}

function StatCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-lg font-bold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function TeamFormCard({ form, label }: { form: TeamForm; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <FormBadge form={form.formString} />
      </div>
      <span className="text-sm font-semibold text-foreground">{form.team.name}</span>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <FormStat label="O" value={form.played} />
        <FormStat label="Attığı" value={form.avgScored.toFixed(1)} />
        <FormStat label="Yediği" value={form.avgConceded.toFixed(1)} />
      </dl>
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span className="text-primary">{form.wins}G</span>
        <span>{form.draws}B</span>
        <span className="text-destructive">{form.losses}M</span>
      </div>
    </div>
  )
}

function FormStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
