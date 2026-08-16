"use client"

import { Check, Users } from "lucide-react"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/contexts/language-context"
import type { VoteChoice, VoteState } from "@/lib/types"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => res.json() as Promise<VoteState>)

function pct(count: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((count / total) * 100)
}

export function MatchVoteBar({
  fixtureId,
  homeName,
  awayName,
}: {
  fixtureId: number
  homeName: string
  awayName: string
}) {
  const { locale, t } = useLanguage()
  const { data, mutate } = useSWR<VoteState>(`/api/vote?fixtureId=${fixtureId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const [optimistic, setOptimistic] = useState<VoteState | null>(null)
  const [pending, setPending] = useState(false)
  // Bar açıldığında yüzdeler %0'dan gerçek değerlere doğru animasyonla büyüsün.
  const [revealed, setRevealed] = useState(false)
  // Oy verilen/değiştirilen tarafa göre reveal animasyonunun hangi noktadan
  // açılacağını belirler (bkz. globals.css .vote-reveal-{home,draw,away}).
  // Her değişiklikte bir sayaç artırılır ki React aynı seçime tekrar
  // basıldığında da (key değişmese bile) animasyon yeniden oynasın.
  const [revealKey, setRevealKey] = useState(0)

  const state = optimistic ?? data ?? null
  const hasVoted = !!state?.myVote

  useEffect(() => {
    if (!hasVoted) {
      setRevealed(false)
      return
    }
    const id = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(id)
  }, [hasVoted])

  async function vote(choice: VoteChoice) {
    if (pending || !state || state.myVote === choice) return
    setPending(true)
    setRevealKey((k) => k + 1)

    // Anında yerel önizleme — kullanıcı butona bastığı an çubuk açılır/güncellenir.
    // Önceki oy varsa ve değişiyorsa, eski seçimin sayacını düşürüp yenisini
    // artırıyoruz (toplam oy sayısı sabit kalır) — sunucudaki castVote ile aynı mantık.
    const previous = state.myVote
    const nextCounts = { ...state.counts, [choice]: state.counts[choice] + 1 }
    if (previous && previous !== choice) {
      nextCounts[previous] = Math.max(0, nextCounts[previous] - 1)
    }
    const next: VoteState = {
      ...state,
      myVote: choice,
      counts: nextCounts,
      total: previous ? state.total : state.total + 1,
    }
    setOptimistic(next)

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, choice }),
        cache: "no-store",
      })
      if (res.ok) {
        const server = (await res.json()) as VoteState
        setOptimistic(null)
        await mutate(server)
      }
    } catch {
      // Sessizce geç — yerel önizleme yine de kullanıcıya oyunu verdiğini gösterir.
    } finally {
      setPending(false)
    }
  }

  if (!state) {
    return (
      <div className="h-[52px] animate-pulse rounded-2xl border border-border/60 bg-card" aria-hidden="true" />
    )
  }

  const homePct = pct(state.counts.home, state.total)
  const drawPct = pct(state.counts.draw, state.total)
  const awayPct = pct(state.counts.away, state.total)

  return (
    <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("matchVote.prompt")}
        </span>
        {hasVoted && (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground tabular-nums">
            <Users className="h-3 w-3" />
            {t("matchVote.votes", { count: state.total.toLocaleString(locale === "tr" ? "tr-TR" : "en-US") })}
          </span>
        )}
      </div>

      <div className="px-4 pb-4 pt-2.5">
        {!hasVoted ? (
          <div className="grid grid-cols-3 gap-2">
            <VoteButton
              label={homeName}
              onClick={() => vote("home")}
              disabled={pending}
              className="border-primary/30 hover:bg-primary/10 hover:border-primary/50"
            />
            <VoteButton
              label={t("matchVote.drawOption")}
              onClick={() => vote("draw")}
              disabled={pending}
              className="border-border hover:bg-secondary hover:border-muted-foreground/40"
            />
            <VoteButton
              label={awayName}
              onClick={() => vote("away")}
              disabled={pending}
              className="border-accent/30 hover:bg-accent/10 hover:border-accent/50"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Segmented percentage bar — oy verilen/değiştirilen tarafa göre
                soldan (ev), ortadan (berabere) veya sağdan (deplasman) açılır.
                `key={revealKey}` her oy değişikliğinde bu satırı yeniden mount
                edip animasyonun tekrar oynamasını sağlar. */}
            <div
              key={revealKey}
              className={cn(
                "flex h-8 w-full overflow-hidden rounded-lg bg-secondary/60",
                `vote-reveal-${state.myVote}`,
              )}
            >
              <VoteSegment
                pctValue={revealed ? homePct : 0}
                color="bg-primary"
                textColor="text-primary-foreground"
                label={homePct > 8 ? `%${homePct}` : ""}
              />
              <VoteSegment
                pctValue={revealed ? drawPct : 0}
                color="bg-muted-foreground/70"
                textColor="text-secondary"
                label={drawPct > 8 ? `%${drawPct}` : ""}
              />
              <VoteSegment
                pctValue={revealed ? awayPct : 0}
                color="bg-accent"
                textColor="text-accent-foreground"
                label={awayPct > 8 ? `%${awayPct}` : ""}
              />
            </div>

            {/* Labels — seçilen taraf dolgulu bir rozetle ve onay ikonuyla belirtilir.
                Etiketlere tıklanarak oy değiştirilebilir. */}
            <div className="grid grid-cols-3 gap-2">
              <VoteLabel
                label={homeName}
                active={state.myVote === "home"}
                tone="text-primary"
                activeClassName="border-primary/50 bg-primary/12"
                onClick={() => vote("home")}
                disabled={pending}
              />
              <VoteLabel
                label={t("matchVote.drawOption")}
                active={state.myVote === "draw"}
                tone="text-foreground"
                activeClassName="border-foreground/30 bg-foreground/8"
                onClick={() => vote("draw")}
                disabled={pending}
              />
              <VoteLabel
                label={awayName}
                active={state.myVote === "away"}
                tone="text-accent"
                activeClassName="border-accent/50 bg-accent/12"
                onClick={() => vote("away")}
                disabled={pending}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function VoteButton({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "truncate rounded-lg border bg-secondary/40 px-2 py-2.5 text-xs font-bold text-foreground transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {label}
    </button>
  )
}

function VoteSegment({
  pctValue,
  color,
  textColor,
  label,
}: {
  pctValue: number
  color: string
  textColor: string
  label: string
}) {
  return (
    <div
      style={{ width: `${pctValue}%` }}
      className={cn("flex items-center justify-center transition-[width] duration-700 ease-out", color)}
    >
      {label && <span className={cn("text-[11px] font-bold tabular-nums", textColor)}>{label}</span>}
    </div>
  )
}

function VoteLabel({
  label,
  active,
  tone,
  activeClassName,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  tone: string
  activeClassName: string
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1 truncate rounded-lg border border-transparent px-1.5 py-1 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-70",
        active ? activeClassName : "hover:bg-secondary hover:border-muted-foreground/30",
      )}
    >
      {active && <Check className={cn("h-3 w-3 shrink-0", tone)} aria-hidden="true" />}
      <span
        className={cn("truncate text-[11px] font-medium", active ? cn("font-bold", tone) : "text-muted-foreground")}
      >
        {label}
      </span>
      <span className="sr-only">{active ? t("matchVote.yourVoteSrOnly") : t("matchVote.changeVoteSrOnly")}</span>
    </button>
  )
}
