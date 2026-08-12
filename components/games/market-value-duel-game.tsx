"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Flame, LoaderCircle, RotateCcw, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { DuelPlayerCard } from "@/components/games/duel-player-card"
import type { DuelPlayer, DuelResult, DuelRound } from "@/lib/games/market-value-duel"

type Phase = "loading" | "playing" | "revealed" | "error"

export function MarketValueDuelGame() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [round, setRound] = useState<DuelRound | null>(null)
  const [result, setResult] = useState<DuelResult | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Aynı anda birden fazla tur isteğinin çakışmasını önlemek için.
  const loadingRef = useRef(false)

  const loadRound = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setPhase("loading")
    setResult(null)
    setPickedId(null)
    try {
      const res = await fetch("/api/games/market-value-duel", { cache: "no-store" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.error ?? "Oyun yüklenemedi.")
        setPhase("error")
        return
      }
      const data = (await res.json()) as DuelRound
      setRound(data)
      setPhase("playing")
    } catch {
      setErrorMsg("Bağlantı hatası. Lütfen tekrar deneyin.")
      setPhase("error")
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    loadRound()
  }, [loadRound])

  const handlePick = useCallback(
    async (player: DuelPlayer) => {
      if (!round || phase !== "playing") return
      setPickedId(player.id)
      setPhase("revealed")

      try {
        const res = await fetch("/api/games/market-value-duel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: round.token }),
          cache: "no-store",
        })
        if (!res.ok) {
          setErrorMsg("Sonuç alınamadı.")
          setPhase("error")
          return
        }
        const data = (await res.json()) as DuelResult
        setResult(data)

        const correct = data.correctId === player.id
        if (correct) {
          setScore((s) => s + 1)
          setStreak((s) => {
            const next = s + 1
            setBestStreak((b) => Math.max(b, next))
            return next
          })
        } else {
          setStreak(0)
        }
      } catch {
        setErrorMsg("Sonuç alınamadı.")
        setPhase("error")
      }
    },
    [round, phase],
  )

  const handleNext = useCallback(() => {
    loadRound()
  }, [loadRound])

  const handleRestart = useCallback(() => {
    setScore(0)
    setStreak(0)
    loadRound()
  }, [loadRound])

  const revealed = phase === "revealed" && result !== null

  return (
    <div className="flex flex-col gap-6">
      {/* Skor tablosu */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Skor
            </span>
            <span className="text-base font-black tabular-nums text-foreground">{score}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRestart}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Oyunu yeniden başlat"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sıfırla</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Seri
            </span>
            <span
              className={cn(
                "text-base font-black tabular-nums",
                streak >= 3 ? "text-orange-500" : "text-foreground",
              )}
            >
              {streak}
            </span>
          </div>
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              streak >= 3 ? "bg-orange-500/10 text-orange-500" : "bg-muted text-muted-foreground",
            )}
          >
            <Flame className={cn("h-4.5 w-4.5", streak >= 3 && "animate-pulse")} />
          </div>
        </div>
      </div>

      {/* En iyi seri bilgisi */}
      {bestStreak > 0 && (
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          En iyi serin: <span className="font-semibold text-foreground">{bestStreak}</span>
        </p>
      )}

      {/* Oyun alanı */}
      <div className="relative min-h-[420px]">
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-card"
            >
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Oyuncular getiriliyor
              </span>
            </motion.div>
          )}

          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl border border-border/60 bg-card px-6 text-center"
            >
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <button
                type="button"
                onClick={loadRound}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Tekrar Dene
              </button>
            </motion.div>
          )}

          {(phase === "playing" || phase === "revealed") && round && (
            <motion.div
              key={round.token}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              {!revealed && (
                <p className="text-balance text-center text-sm font-medium text-muted-foreground">
                  Piyasa değeri daha yüksek olan futbolcuyu seç
                </p>
              )}

              <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                <DuelPlayerCard
                  player={round.players[0]}
                  side="left"
                  revealed={revealed}
                  value={result?.values[round.players[0].id] ?? null}
                  isCorrect={
                    revealed && result ? result.correctId === round.players[0].id : null
                  }
                  isPicked={pickedId === round.players[0].id}
                  disabled={phase !== "playing"}
                  onPick={() => handlePick(round.players[0])}
                />

                {/* VS ayırıcı */}
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center sm:inset-y-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 16 }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-secondary text-[11px] font-black text-muted-foreground shadow-md"
                  >
                    VS
                  </motion.div>
                </div>

                <DuelPlayerCard
                  player={round.players[1]}
                  side="right"
                  revealed={revealed}
                  value={result?.values[round.players[1].id] ?? null}
                  isCorrect={
                    revealed && result ? result.correctId === round.players[1].id : null
                  }
                  isPicked={pickedId === round.players[1].id}
                  disabled={phase !== "playing"}
                  onPick={() => handlePick(round.players[1])}
                />
              </div>

              {/* Sonraki tur butonu */}
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ delay: 0.35, duration: 0.3 }}
                    className="flex justify-center"
                  >
                    <button
                      type="button"
                      onClick={handleNext}
                      className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95"
                    >
                      Sonraki Tur
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
