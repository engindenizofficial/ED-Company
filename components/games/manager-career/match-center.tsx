"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Loader2, PartyPopper, Play, SkipForward } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { playNextFixture, type FixtureSummary, type LeagueTableRow, type PlayedMatchResult } from "@/app/actions/manager-fixtures"

/** Her gerçek zamanlı dakikanın kaç ms sürdüğü — 90 dakika ~= 63 saniye. */
const MS_PER_MINUTE = 700

interface MatchCenterProps {
  nextFixture: FixtureSummary | null
  lastPlayedMatch: PlayedMatchResult | null
  seasonComplete: boolean
  onResult: (table: LeagueTableRow[], nextFixture: FixtureSummary | null, seasonComplete: boolean) => void
}

type Phase = "idle" | "loading" | "playing" | "summary"

function TeamHeader({ name, logo, align }: { name: string; logo: string | null; align: "left" | "right" }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center gap-2 text-center", align === "left" ? "items-end" : "items-start")}>
      {logo ? (
        <Image src={logo} alt="" width={48} height={48} className="h-12 w-12 object-contain" unoptimized />
      ) : (
        <span className="h-12 w-12" />
      )}
      <span className="max-w-[9rem] truncate text-sm font-bold text-foreground">{name}</span>
    </div>
  )
}

function EventRow({ event, t }: { event: PlayedMatchResult["events"][number]; t: (key: string) => string }) {
  const isGoal = event.type === "goal"
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-sm",
        event.side === "away" && "flex-row-reverse text-right",
      )}
    >
      <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
        {event.minute}&apos;
      </span>
      <span className={cn("flex items-center gap-1.5", event.side === "away" && "flex-row-reverse")}>
        {isGoal ? (
          <span className="text-base leading-none">&#9917;</span>
        ) : (
          <span className="h-3 w-2 shrink-0 rounded-[2px] bg-yellow-400" />
        )}
        <span className="font-medium text-foreground">{event.playerName}</span>
      </span>
    </li>
  )
}

/**
 * Maç merkezi — "Maçı Oynat" butonu, sonucu anında hesaplayan `playNextFixture`
 * server action'ını çağırır; ardından dönen olay listesini (events) dakika
 * sayacıyla senkronize şekilde akışa ekler. Sonuç bir kez animasyonla
 * gösterildikten sonra (veya sayfa `lastPlayedMatch` ile açıldığında) kalıcı
 * özet olarak kalır, bir daha animasyon oynatılmaz.
 */
export function MatchCenter({ nextFixture, lastPlayedMatch, seasonComplete, onResult }: MatchCenterProps) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<PlayedMatchResult | null>(lastPlayedMatch)
  const [minute, setMinute] = useState(0)
  const [visibleEvents, setVisibleEvents] = useState<PlayedMatchResult["events"]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function stopClock() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function startClock(matchResult: PlayedMatchResult) {
    setMinute(0)
    setVisibleEvents([])
    setPhase("playing")
    let currentMinute = 0
    intervalRef.current = setInterval(() => {
      currentMinute += 1
      setMinute(currentMinute)
      setVisibleEvents(matchResult.events.filter((e) => e.minute <= currentMinute))
      if (currentMinute >= 90) {
        stopClock()
        setPhase("summary")
      }
    }, MS_PER_MINUTE)
  }

  function handlePlay() {
    if (phase === "loading" || phase === "playing") return
    setPhase("loading")
    playNextFixture()
      .then((res) => {
        if (!res.ok) {
          setPhase("idle")
          return
        }
        if (res.seasonComplete) {
          onResult(res.table, null, true)
          setPhase("idle")
          return
        }
        setResult(res.userMatch)
        onResult(res.table, res.nextFixture, false)
        startClock(res.userMatch)
      })
      .catch(() => setPhase("idle"))
  }

  function handleFastForward() {
    if (!result || phase !== "playing") return
    stopClock()
    setMinute(90)
    setVisibleEvents(result.events)
    setPhase("summary")
  }

  if (seasonComplete) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-8 text-center">
        <PartyPopper className="h-9 w-9 text-emerald-500" />
        <h3 className="text-lg font-black text-foreground">{t("managerCareer.seasonCompleteTitle")}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{t("managerCareer.seasonCompleteDesc")}</p>
      </div>
    )
  }

  const showingLiveOrSummary = (phase === "playing" || phase === "summary") && result !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        {showingLiveOrSummary ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <TeamHeader name={result!.homeTeamName} logo={result!.homeTeamLogo} align="right" />
              <div className="flex flex-col items-center gap-1 px-3">
                <span className="text-3xl font-black tabular-nums text-foreground">
                  {visibleEvents.filter((e) => e.type === "goal" && e.side === "home").length}
                  {" - "}
                  {visibleEvents.filter((e) => e.type === "goal" && e.side === "away").length}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    phase === "playing" ? "bg-red-500/15 text-red-500" : "bg-muted text-muted-foreground",
                  )}
                >
                  {phase === "playing" ? `${minute}'` : t("managerCareer.matchEndedBadge")}
                </span>
              </div>
              <TeamHeader name={result!.awayTeamName} logo={result!.awayTeamLogo} align="left" />
            </div>

            {phase === "playing" ? (
              <Button variant="outline" size="sm" className="mx-auto" onClick={handleFastForward}>
                <SkipForward data-icon="inline-start" />
                {t("managerCareer.fastForward")}
              </Button>
            ) : null}

            <ul className="flex flex-col gap-2 border-t border-border/60 pt-3">
              {visibleEvents.length === 0 ? (
                <li className="py-2 text-center text-xs text-muted-foreground">
                  {phase === "playing" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : null}
                </li>
              ) : (
                visibleEvents
                  .slice()
                  .sort((a, b) => b.minute - a.minute)
                  .map((event, i) => <EventRow key={`${event.minute}-${i}`} event={event} t={t} />)
              )}
            </ul>
          </div>
        ) : nextFixture ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <TeamHeader name={nextFixture.homeTeamName} logo={nextFixture.homeTeamLogo} align="right" />
              <span className="px-3 text-lg font-black text-muted-foreground">{t("managerCareer.vsLabel")}</span>
              <TeamHeader name={nextFixture.awayTeamName} logo={nextFixture.awayTeamLogo} align="left" />
            </div>
            <Button onClick={handlePlay} disabled={phase === "loading"} className="bg-emerald-600 hover:bg-emerald-600/90">
              {phase === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                  {t("managerCareer.playingMatch")}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" data-icon="inline-start" />
                  {t("managerCareer.playMatchButton")}
                </>
              )}
            </Button>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("managerCareer.noNextMatch")}</p>
        )}
      </div>
    </div>
  )
}
