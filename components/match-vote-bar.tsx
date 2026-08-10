"use client"

import { Users } from "lucide-react"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
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
  const { data, mutate } = useSWR<VoteState>(`/api/vote?fixtureId=${fixtureId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const [optimistic, setOptimistic] = useState<VoteState | null>(null)
  const [pending, setPending] = useState(false)
  // Bar açıldığında yüzdeler %0'dan gerçek değerlere doğru animasyonla büyüsün.
  const [revealed, setRevealed] = useState(false)

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
    if (pending || hasVoted || !state) return
    setPending(true)

    // Anında yerel önizleme — kullanıcı butona bastığı an çubuk açılır.
    const next: VoteState = {
      ...state,
      myVote: choice,
      counts: { ...state.counts, [choice]: state.counts[choice] + 1 },
      total: state.total + 1,
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
          Sence Kim Kazanır?
        </span>
        {hasVoted && (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground tabular-nums">
            <Users className="h-3 w-3" />
            {state.total.toLocaleString("tr-TR")} oy
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
              label="Berabere"
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
          <div className="flex flex-col gap-2">
            {/* Segmented percentage bar */}
            <div className="flex h-8 w-full overflow-hidden rounded-lg bg-secondary/60">
              <VoteSegment
                pctValue={revealed ? homePct : 0}
                color="bg-primary"
                textColor="text-primary-foreground"
                active={state.myVote === "home"}
                label={homePct > 8 ? `%${homePct}` : ""}
              />
              <VoteSegment
                pctValue={revealed ? drawPct : 0}
                color="bg-muted-foreground/70"
                textColor="text-secondary"
                active={state.myVote === "draw"}
                label={drawPct > 8 ? `%${drawPct}` : ""}
              />
              <VoteSegment
                pctValue={revealed ? awayPct : 0}
                color="bg-accent"
                textColor="text-accent-foreground"
                active={state.myVote === "away"}
                label={awayPct > 8 ? `%${awayPct}` : ""}
              />
            </div>

            {/* Labels */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <VoteLabel label={homeName} active={state.myVote === "home"} dotClassName="bg-primary" />
              <VoteLabel label="Berabere" active={state.myVote === "draw"} dotClassName="bg-muted-foreground/70" />
              <VoteLabel label={awayName} active={state.myVote === "away"} dotClassName="bg-accent" />
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
  active,
  label,
}: {
  pctValue: number
  color: string
  textColor: string
  active: boolean
  label: string
}) {
  return (
    <div
      style={{ width: `${pctValue}%` }}
      className={cn(
        "flex items-center justify-center transition-[width] duration-700 ease-out",
        color,
        active && "ring-2 ring-inset ring-foreground/25",
      )}
    >
      {label && <span className={cn("text-[11px] font-bold tabular-nums", textColor)}>{label}</span>}
    </div>
  )
}

function VoteLabel({
  label,
  active,
  dotClassName,
}: {
  label: string
  active: boolean
  dotClassName: string
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 truncate">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)} aria-hidden="true" />
      <span
        className={cn(
          "truncate text-[11px] font-medium",
          active ? "font-bold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  )
}
