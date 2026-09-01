"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Clock3, Flame, Gauge, Globe2, RotateCcw, Skull, Sparkles, Swords, Trophy, Volume2, VolumeX, Zap } from "lucide-react"
import { DuelPlayerCard } from "@/components/games/duel-player-card"
import { useLanguage } from "@/contexts/language-context"
import { DUEL_SELECTABLE_LEAGUES } from "@/lib/leagues"
import type { DuelDifficulty, DuelPlayer, DuelResult, DuelRound } from "@/lib/games/market-value-duel"
import { useSoundEffects } from "@/lib/games/use-sound-effects"
import { toDisplayCountry } from "@/lib/tr-aliases"
import { cn } from "@/lib/utils"

const ALL_LEAGUE_IDS = DUEL_SELECTABLE_LEAGUES.map((league) => league.id)
const TOTAL_ROUNDS = 10
const ROUND_SECONDS = 10
const BASE_POINTS = 100
const SPEED_POINT_MULTIPLIER = 10

type Phase = "select-difficulty" | "select-leagues" | "loading" | "playing" | "revealed" | "finished" | "error"

export function MarketValueDuelGame() {
  const { t, locale } = useLanguage()
  const { play, muted, toggleMuted } = useSoundEffects()
  const [phase, setPhase] = useState<Phase>("select-difficulty")
  const [difficulty, setDifficulty] = useState<DuelDifficulty | null>(null)
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<number>>(() => new Set())
  const [round, setRound] = useState<DuelRound | null>(null)
  const [result, setResult] = useState<DuelResult | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [roundNumber, setRoundNumber] = useState(1)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [score, setScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [lastSpeedBonus, setLastSpeedBonus] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [seenPlayerIds, setSeenPlayerIds] = useState<number[]>([])
  const [flash, setFlash] = useState<"good" | "bad" | null>(null)
  const [comboPop, setComboPop] = useState<number | null>(null)
  const loadingRef = useRef(false)
  const resolvingRef = useRef(false)
  const hasPlayedRef = useRef(false)

  const difficulties = useMemo(() => [
    { id: "easy" as const, label: t("duel.easy"), desc: t("duel.easyDesc"), icon: Sparkles, accent: "text-primary ring-primary/30 bg-primary/10" },
    { id: "normal" as const, label: t("duel.normal"), desc: t("duel.normalDesc"), icon: Gauge, accent: "text-foreground ring-border bg-muted" },
    { id: "hard" as const, label: t("duel.hard"), desc: t("duel.hardDesc"), icon: Skull, accent: "text-destructive ring-destructive/30 bg-destructive/10" },
  ], [t])

  const loadRound = useCallback(async (activeDifficulty: DuelDifficulty, activeLeagues: Set<number>, excluded: number[]) => {
    if (loadingRef.current) return
    loadingRef.current = true
    resolvingRef.current = false
    setPhase("loading")
    setResult(null)
    setPickedId(null)
    setLastSpeedBonus(0)
    try {
      const params = new URLSearchParams({ difficulty: activeDifficulty })
      if (activeLeagues.size < ALL_LEAGUE_IDS.length) params.set("leagues", Array.from(activeLeagues).join(","))
      if (excluded.length > 0) params.set("exclude", excluded.join(","))
      const response = await fetch(`/api/games/market-value-duel?${params}`, { cache: "no-store" })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setErrorMsg(data?.error === "notEnoughPlayers" ? t("apiErrors.notEnoughPlayers") : t("duel.loadFailed"))
        setPhase("error")
        return
      }
      const nextRound = await response.json() as DuelRound
      setRound(nextRound)
      setSeenPlayerIds((current) => Array.from(new Set([...current, ...nextRound.players.map((player) => player.id)])))
      setSecondsLeft(ROUND_SECONDS)
      setPhase("playing")
      if (hasPlayedRef.current) play("newRound")
      hasPlayedRef.current = true
    } catch {
      setErrorMsg(t("duel.connectionError"))
      setPhase("error")
    } finally {
      loadingRef.current = false
    }
  }, [play, t])

  const resolveRound = useCallback(async (player: DuelPlayer | null) => {
    if (!round || phase !== "playing" || resolvingRef.current) return
    resolvingRef.current = true
    setPickedId(player?.id ?? null)
    setPhase("revealed")
    try {
      const response = await fetch("/api/games/market-value-duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: round.token }),
        cache: "no-store",
      })
      if (!response.ok) throw new Error("result")
      const data = await response.json() as DuelResult
      setResult(data)
      const correct = player !== null && data.correctId === player.id
      setFlash(correct ? "good" : "bad")
      if (correct) {
        const speedBonus = secondsLeft * SPEED_POINT_MULTIPLIER
        setLastSpeedBonus(speedBonus)
        setScore((value) => value + BASE_POINTS + speedBonus)
        setCorrectCount((value) => value + 1)
        setStreak((value) => {
          const next = value + 1
          setBestStreak((best) => Math.max(best, next))
          if (next >= 2) {
            setComboPop(next)
            window.setTimeout(() => play("combo"), 220)
            window.setTimeout(() => setComboPop(null), 900)
          }
          return next
        })
        play("correct")
      } else {
        setStreak(0)
        play("wrong")
      }
    } catch {
      setErrorMsg(t("duel.resultFailed"))
      setPhase("error")
    }
  }, [phase, play, round, secondsLeft, t])

  useEffect(() => {
    if (phase !== "playing") return
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          window.setTimeout(() => void resolveRound(null), 0)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase, resolveRound])

  const startGame = useCallback(() => {
    if (!difficulty || selectedLeagueIds.size === 0) return
    setRoundNumber(1)
    setScore(0)
    setCorrectCount(0)
    setStreak(0)
    setBestStreak(0)
    setSeenPlayerIds([])
    hasPlayedRef.current = false
    void loadRound(difficulty, selectedLeagueIds, [])
  }, [difficulty, loadRound, selectedLeagueIds])

  const nextRound = useCallback(() => {
    if (roundNumber >= TOTAL_ROUNDS) {
      setPhase("finished")
      return
    }
    setRoundNumber((value) => value + 1)
    if (difficulty) void loadRound(difficulty, selectedLeagueIds, seenPlayerIds)
  }, [difficulty, loadRound, roundNumber, seenPlayerIds, selectedLeagueIds])

  const resetSelections = useCallback(() => {
    setDifficulty(null)
    setRound(null)
    setResult(null)
    setSeenPlayerIds([])
    setPhase("select-difficulty")
  }, [])

  const revealed = phase === "revealed" && result !== null
  const wrongPick = revealed && pickedId !== null && result.correctId !== pickedId
  const currentDifficulty = difficulties.find((item) => item.id === difficulty)
  const accuracy = Math.round((correctCount / TOTAL_ROUNDS) * 100)

  if (phase === "select-difficulty") return (
    <div className="flex min-h-[440px] flex-col items-center justify-center gap-8 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30"><Swords className="size-6" /></div>
        <h2 className="text-xl font-black uppercase italic tracking-tight text-foreground">{t("duel.chooseDifficulty")}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("duel.chooseDifficultyDesc")}</p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
        {difficulties.map((item, index) => {
          const Icon = item.icon
          return <motion.button key={item.id} type="button" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .08 }} onClick={() => { setDifficulty(item.id); setPhase("select-leagues") }} className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-4 py-6 text-center transition-transform hover:-translate-y-1">
            <span className={cn("flex size-12 items-center justify-center rounded-xl ring-1", item.accent)}><Icon className="size-5" /></span>
            <span className="font-black uppercase italic text-foreground">{item.label}</span><span className="text-xs leading-relaxed text-muted-foreground">{item.desc}</span>
          </motion.button>
        })}
      </div>
    </div>
  )

  if (phase === "select-leagues") {
    const allSelected = selectedLeagueIds.size === ALL_LEAGUE_IDS.length
    return <div className="flex min-h-[440px] flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center gap-2 text-center"><Globe2 className="size-8 text-primary" /><h2 className="text-xl font-black uppercase italic">{t("duel.chooseLeagues")}</h2><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("duel.chooseLeaguesDesc")}</p></div>
      <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
        <button type="button" onClick={() => setSelectedLeagueIds(allSelected ? new Set() : new Set(ALL_LEAGUE_IDS))} className={cn("rounded-full border px-4 py-2 text-xs font-bold", allSelected ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground")}>{allSelected && <Check className="mr-1 inline size-3" />}{t("duel.allLeagues")}</button>
        {DUEL_SELECTABLE_LEAGUES.map((league) => { const selected = selectedLeagueIds.has(league.id); return <button key={league.id} type="button" aria-pressed={selected} onClick={() => setSelectedLeagueIds((current) => { const next = new Set(current); if (selected) next.delete(league.id); else next.add(league.id); return next })} className={cn("rounded-full border px-3 py-2 text-xs font-semibold", selected ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground")}>{league.name} · {toDisplayCountry(league.country, locale)}</button> })}
      </div>
      <p className="text-xs text-muted-foreground">{selectedLeagueIds.size ? t("duel.leaguesSelectedCount", { count: selectedLeagueIds.size }) : t("duel.selectAtLeastOneLeague")}</p>
      <div className="flex gap-3"><button type="button" onClick={resetSelections} className="px-5 py-2 text-sm font-bold text-muted-foreground">{t("duel.back")}</button><button type="button" onClick={startGame} disabled={!selectedLeagueIds.size} className="rounded-full bg-primary px-7 py-2.5 text-sm font-black uppercase text-primary-foreground disabled:opacity-40">{t("duel.startGame")}</button></div>
    </div>
  }

  if (phase === "finished") return <div className="flex min-h-[440px] flex-col items-center justify-center gap-6 rounded-3xl border border-primary/20 bg-card p-6 text-center">
    <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary"><Trophy className="size-8" /></div>
    <div className="flex flex-col gap-2"><p className="text-xs font-bold uppercase tracking-widest text-primary">{t("duel.gameComplete")}</p><h2 className="text-3xl font-black italic text-balance">{score} {t("duel.points")}</h2><p className="text-sm text-muted-foreground">{t("duel.resultSummary", { correct: correctCount, total: TOTAL_ROUNDS })}</p></div>
    <div className="grid w-full max-w-md grid-cols-3 gap-2"><ResultStat label={t("duel.accuracy")} value={`${accuracy}%`} /><ResultStat label={t("duel.correctAnswers")} value={`${correctCount}/${TOTAL_ROUNDS}`} /><ResultStat label={t("duel.bestStreak")} value={String(bestStreak)} /></div>
    <div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={startGame} className="rounded-full bg-primary px-6 py-2.5 text-sm font-black uppercase text-primary-foreground"><RotateCcw className="mr-2 inline size-4" />{t("duel.playAgain")}</button><button type="button" onClick={resetSelections} className="rounded-full border border-border px-6 py-2.5 text-sm font-bold">{t("duel.changeSettings")}</button></div>
  </div>

  return <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-card px-4 py-3">
      <Hud icon={Trophy} label={t("duel.score")} value={String(score)} />
      <div className="flex flex-col items-center gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("duel.roundOf", { current: roundNumber, total: TOTAL_ROUNDS })}</span><div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${roundNumber * 10}%` }} /></div></div>
      <div className="flex items-center gap-2"><button type="button" onClick={toggleMuted} aria-label={muted ? t("duel.muteOn") : t("duel.muteOff")} className="text-muted-foreground">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button><Hud icon={Flame} label={t("duel.streak")} value={String(streak)} /></div>
    </div>

    {phase === "playing" && <div className="flex items-center gap-3" aria-live="polite"><Clock3 className={cn("size-5", secondsLeft <= 3 ? "text-destructive" : "text-primary")} /><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full transition-all duration-1000", secondsLeft <= 3 ? "bg-destructive" : "bg-primary")} style={{ width: `${secondsLeft * 10}%` }} /></div><span className="w-8 text-right font-mono text-lg font-black tabular-nums">{secondsLeft}</span></div>}
    {revealed && lastSpeedBonus > 0 && <p className="text-center text-sm font-bold text-primary"><Zap className="mr-1 inline size-4" />{t("duel.speedBonus", { points: lastSpeedBonus })}</p>}
    {revealed && pickedId === null && <p className="text-center text-sm font-bold text-destructive" role="status">{t("duel.timeUp")}</p>}

    <div className={cn("relative min-h-[440px]", wrongPick && "animate-shake-bad")}>
      <AnimatePresence mode="wait">
        {phase === "loading" && <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card"><Swords className="size-8 animate-pulse text-primary" /><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("duel.opponentsEntering")}</span></motion.div>}
        {phase === "error" && <motion.div key="error" className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-6 text-center"><p className="text-sm text-muted-foreground">{errorMsg}</p><button type="button" onClick={() => difficulty && void loadRound(difficulty, selectedLeagueIds, seenPlayerIds)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{t("duel.tryAgain")}</button></motion.div>}
        {(phase === "playing" || phase === "revealed") && round && <motion.div key={round.token} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {!revealed && <p className="text-balance text-center text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("duel.pickHigherValue")}</p>}
          <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            {round.players.map((player, index) => <DuelPlayerCard key={player.id} player={player} side={index === 0 ? "left" : "right"} revealed={revealed} value={result?.values[player.id] ?? null} isCorrect={revealed ? result?.correctId === player.id : null} isPicked={pickedId === player.id} disabled={phase !== "playing"} onPick={() => void resolveRound(player)} />)}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="flex size-11 items-center justify-center rounded-full border-2 border-background bg-secondary text-xs font-black">VS</span></div>
          </div>
          {revealed && <div className="flex justify-center"><button type="button" onClick={nextRound} className="rounded-full bg-primary px-7 py-2.5 text-sm font-black uppercase text-primary-foreground">{roundNumber === TOTAL_ROUNDS ? t("duel.seeResults") : t("duel.nextOpponent")}</button></div>}
        </motion.div>}
      </AnimatePresence>
    </div>
    <span className="sr-only" aria-live="assertive">{comboPop ? t("duel.combo", { count: comboPop }) : flash === "good" ? t("duel.answerCorrect") : flash === "bad" ? t("duel.answerWrong") : ""}</span>
    {currentDifficulty && <p className="text-center text-xs text-muted-foreground">{currentDifficulty.label} · {t("duel.bestStreak")} {bestStreak}</p>}
  </div>
}

function Hud({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return <div className="flex items-center gap-2"><Icon className="size-5 text-primary" /><div className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span><span className="font-black tabular-nums">{value}</span></div></div>
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1 rounded-xl bg-muted p-3"><span className="text-xl font-black tabular-nums">{value}</span><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span></div>
}
