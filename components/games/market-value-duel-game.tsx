"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  Check,
  Flame,
  Gauge,
  Globe2,
  RotateCcw,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DuelPlayerCard } from "@/components/games/duel-player-card"
import { useSoundEffects } from "@/lib/games/use-sound-effects"
import { useLanguage } from "@/contexts/language-context"
import { DUEL_SELECTABLE_LEAGUES } from "@/lib/leagues"
import { toDisplayCountry } from "@/lib/tr-aliases"
import type { DuelDifficulty, DuelPlayer, DuelResult, DuelRound } from "@/lib/games/market-value-duel"

const ALL_LEAGUE_IDS = DUEL_SELECTABLE_LEAGUES.map((l) => l.id)

type Phase = "select-difficulty" | "select-leagues" | "loading" | "playing" | "revealed" | "error"

export function MarketValueDuelGame() {
  const { t, locale } = useLanguage()

  const DIFFICULTIES: {
    id: DuelDifficulty
    label: string
    desc: string
    icon: typeof Gauge
    accent: string
  }[] = [
    {
      id: "easy",
      label: t("duel.easy"),
      desc: t("duel.easyDesc"),
      icon: Sparkles,
      accent: "text-emerald-400 ring-emerald-400/30 bg-emerald-500/10",
    },
    {
      id: "normal",
      label: t("duel.normal"),
      desc: t("duel.normalDesc"),
      icon: Gauge,
      accent: "text-amber-400 ring-amber-400/30 bg-amber-500/10",
    },
    {
      id: "hard",
      label: t("duel.hard"),
      desc: t("duel.hardDesc"),
      icon: Skull,
      accent: "text-rose-400 ring-rose-400/30 bg-rose-500/10",
    },
  ]

  const [phase, setPhase] = useState<Phase>("select-difficulty")
  const [difficulty, setDifficulty] = useState<DuelDifficulty | null>(null)
  // Lig seçimi başta boştur — kullanıcı ya "Tüm Ligler"e basar ya da
  // istediği ligleri tek tek seçer.
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<number>>(() => new Set())
  const [round, setRound] = useState<DuelRound | null>(null)
  const [result, setResult] = useState<DuelResult | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [flash, setFlash] = useState<"good" | "bad" | null>(null)
  const [comboPop, setComboPop] = useState<number | null>(null)
  const { play, muted, toggleMuted } = useSoundEffects()

  // Aynı anda birden fazla tur isteğinin çakışmasını önlemek için.
  const loadingRef = useRef(false)
  // İlk yüklemede "yeni tur" sesinin çalmasını önlemek için (henüz oynanmadı).
  const hasPlayedRef = useRef(false)

  const loadRound = useCallback(
    async (activeDifficulty: DuelDifficulty, activeLeagueIds: Set<number>) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setPhase("loading")
      setResult(null)
      setPickedId(null)
      setFlash(null)
      try {
        // Kullanıcı TÜM seçilebilir ligleri seçtiyse "leagues" parametresini
        // hiç göndermiyoruz — bu, filtresiz istek ile aynı sonucu verir ama
        // sorguyu ve URL'i basit tutar.
        const leaguesParam =
          activeLeagueIds.size > 0 && activeLeagueIds.size < ALL_LEAGUE_IDS.length
            ? `&leagues=${Array.from(activeLeagueIds).join(",")}`
            : ""
        const res = await fetch(
          `/api/games/market-value-duel?difficulty=${activeDifficulty}${leaguesParam}`,
          { cache: "no-store" },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setErrorMsg(data?.error === "notEnoughPlayers" ? t("apiErrors.notEnoughPlayers") : t("duel.loadFailed"))
          setPhase("error")
          return
        }
        const data = (await res.json()) as DuelRound
        setRound(data)
        setPhase("playing")
        if (hasPlayedRef.current) play("newRound")
        hasPlayedRef.current = true
      } catch {
        setErrorMsg(t("duel.connectionError"))
        setPhase("error")
      } finally {
        loadingRef.current = false
      }
    },
    [play, t],
  )

  const handleSelectDifficulty = useCallback((next: DuelDifficulty) => {
    setDifficulty(next)
    setPhase("select-leagues")
  }, [])

  const toggleLeague = useCallback((id: number) => {
    setSelectedLeagueIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAllLeagues = useCallback(() => {
    setSelectedLeagueIds(new Set(ALL_LEAGUE_IDS))
  }, [])

  const handleStartGame = useCallback(() => {
    if (!difficulty || selectedLeagueIds.size === 0) return
    setScore(0)
    setStreak(0)
    setBestStreak(0)
    hasPlayedRef.current = false
    loadRound(difficulty, selectedLeagueIds)
  }, [loadRound, difficulty, selectedLeagueIds])

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
          setErrorMsg(t("duel.resultFailed"))
          setPhase("error")
          return
        }
        const data = (await res.json()) as DuelResult
        setResult(data)

        const correct = data.correctId === player.id
        setFlash(correct ? "good" : "bad")
        if (correct) {
          play("correct")
          setScore((s) => s + 1)
          setStreak((s) => {
            const next = s + 1
            setBestStreak((b) => Math.max(b, next))
            if (next >= 2) {
              setComboPop(next)
              setTimeout(() => play("combo"), 220)
              setTimeout(() => setComboPop(null), 900)
            }
            return next
          })
        } else {
          play("wrong")
          setStreak(0)
        }
      } catch {
        setErrorMsg(t("duel.resultFailed"))
        setPhase("error")
      }
    },
    [round, phase, play, t],
  )

  const handleNext = useCallback(() => {
    if (difficulty) loadRound(difficulty, selectedLeagueIds)
  }, [loadRound, difficulty, selectedLeagueIds])

  const handleRestart = useCallback(() => {
    setScore(0)
    setStreak(0)
    if (difficulty) loadRound(difficulty, selectedLeagueIds)
  }, [loadRound, difficulty, selectedLeagueIds])

  const handleChangeDifficulty = useCallback(() => {
    setDifficulty(null)
    setRound(null)
    setResult(null)
    setPickedId(null)
    setPhase("select-difficulty")
  }, [])

  const handleChangeLeagues = useCallback(() => {
    setRound(null)
    setResult(null)
    setPickedId(null)
    setPhase("select-leagues")
  }, [])

  const revealed = phase === "revealed" && result !== null
  const wrongPick = revealed && result && pickedId !== null && result.correctId !== pickedId
  const currentDifficultyMeta = DIFFICULTIES.find((d) => d.id === difficulty) ?? null

  if (phase === "select-difficulty") {
    return (
      <div className="flex min-h-[440px] flex-col items-center justify-center gap-8 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Swords className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-foreground">
            {t("duel.chooseDifficulty")}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("duel.chooseDifficultyDesc")}
          </p>
        </div>

        <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
          {DIFFICULTIES.map((d, i) => {
            const Icon = d.icon
            return (
              <motion.button
                key={d.id}
                type="button"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 22 }}
                onClick={() => handleSelectDifficulty(d.id)}
                className={cn(
                  "group flex flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-4 py-6 text-center transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-110",
                    d.accent,
                  )}
                >
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <span className="text-base font-black uppercase italic tracking-tight text-foreground">
                  {d.label}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{d.desc}</span>
              </motion.button>
            )
          })}
        </div>
      </div>
    )
  }

  if (phase === "select-leagues") {
    const allSelected = selectedLeagueIds.size === ALL_LEAGUE_IDS.length

    return (
      <div className="flex min-h-[440px] flex-col items-center gap-6 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Globe2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-foreground">
            {t("duel.chooseLeagues")}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("duel.chooseLeaguesDesc")}
          </p>
        </div>

        <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={selectAllLeagues}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
              allSelected
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {allSelected && <Check className="h-3.5 w-3.5" />}
            {t("duel.allLeagues")}
          </button>

          {DUEL_SELECTABLE_LEAGUES.map((league) => {
            const isSelected = selectedLeagueIds.has(league.id)
            return (
              <button
                key={league.id}
                type="button"
                onClick={() => toggleLeague(league.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={league.flagUrl}
                  alt=""
                  className="h-3 w-4 rounded-sm object-cover opacity-90"
                  width={16}
                  height={12}
                  loading="lazy"
                  decoding="async"
                />
                <span>{league.name}</span>
                <span className="text-muted-foreground/70">{toDisplayCountry(league.country, locale)}</span>
              </button>
            )
          })}
        </div>

        <p className="text-xs font-medium text-muted-foreground">
          {selectedLeagueIds.size > 0
            ? t("duel.leaguesSelectedCount", { count: selectedLeagueIds.size })
            : t("duel.selectAtLeastOneLeague")}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleChangeDifficulty}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("duel.back")}
          </button>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={selectedLeagueIds.size === 0}
            className="rounded-full bg-primary px-7 py-2.5 text-sm font-black uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {t("duel.startGame")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tam ekran sonuç flaşı */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setFlash(null)}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className={cn(
              "pointer-events-none fixed inset-0 z-50",
              flash === "good"
                ? "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_65%)]"
                : "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--destructive)_32%,transparent),transparent_65%)]",
            )}
          />
        )}
      </AnimatePresence>

      {/* Combo patlaması */}
      <AnimatePresence>
        {comboPop !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.4, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: -30 }}
            transition={{ type: "spring", stiffness: 380, damping: 16 }}
            className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2"
          >
            <div className="flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-500/15 px-5 py-2 text-orange-300 shadow-[0_0_30px_-5px_rgba(249,115,22,0.6)] backdrop-blur-sm">
              <Zap className="h-4 w-4 fill-orange-300" />
              <span className="text-sm font-black italic tracking-wide">{t("duel.combo", { count: comboPop })}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD skor tablosu */}
      <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-card via-card to-card px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_24px_-8px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_40%,color-mix(in_oklch,var(--primary)_8%,transparent)_50%,transparent_60%)]" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("duel.score")}</span>
            <motion.span
              key={score}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="text-lg font-black tabular-nums text-foreground"
            >
              {score}
            </motion.span>
          </div>
        </div>

        <div className="relative flex items-center gap-1">
          {currentDifficultyMeta && (
            <button
              type="button"
              onClick={handleChangeDifficulty}
              className={cn(
                "flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ring-1 transition-opacity hover:opacity-80 sm:px-2",
                currentDifficultyMeta.accent,
              )}
              aria-label={t("duel.changeDifficulty")}
            >
              <currentDifficultyMeta.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{currentDifficultyMeta.label}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleMuted}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={muted ? t("duel.muteOn") : t("duel.muteOff")}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t("duel.restartAria")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("duel.restart")}</span>
          </button>
        </div>

        <div className="relative flex items-center gap-2.5">
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("duel.streak")}</span>
            <span
              className={cn(
                "text-lg font-black tabular-nums transition-colors",
                streak >= 3 ? "text-orange-400" : "text-foreground",
              )}
            >
              {streak}
            </span>
          </div>
          <div
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              streak >= 3 ? "bg-orange-500/15 text-orange-400 ring-1 ring-orange-400/30" : "bg-muted text-muted-foreground",
            )}
          >
            <Flame className={cn("h-4.5 w-4.5", streak >= 3 && "animate-pulse")} />
          </div>
        </div>
      </div>

      {bestStreak > 0 && (
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          {t("duel.bestStreak")} <span className="font-bold text-foreground">{bestStreak}</span>
        </p>
      )}

      {/* Oyun alanı */}
      <div className={cn("relative min-h-[440px]", wrongPick && "animate-shake-bad")}>
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-3xl border border-primary/15 bg-card/60"
            >
              <div className="relative flex h-16 w-16 items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
                  <Swords className="h-5 w-5" />
                </div>
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t("duel.opponentsEntering")}
              </span>
            </motion.div>
          )}

          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-3xl border border-primary/15 bg-card/60 px-6 text-center"
            >
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("duel.tryAgain")}
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
                <motion.p
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                  className="text-balance text-center text-sm font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {t("duel.pickHigherValue")}
                </motion.p>
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

                {/* VS çarpışma rozeti */}
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center sm:inset-y-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                  <motion.div
                    key={revealed ? "clash" : "idle"}
                    initial={revealed ? { scale: 1.6, opacity: 0 } : { scale: 0, opacity: 0, rotate: -25 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ delay: revealed ? 0 : 0.2, type: "spring", stiffness: 340, damping: 15 }}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full border-2 text-[11px] font-black shadow-lg",
                      revealed
                        ? "border-primary bg-primary text-primary-foreground shadow-primary/40"
                        : "border-background bg-secondary text-muted-foreground shadow-black/30",
                    )}
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
                      className="rounded-full bg-primary px-7 py-2.5 text-sm font-black uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
                    >
                      {t("duel.nextOpponent")}
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
