"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  Circle,
  Clock3,
  DatabaseZap,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  getMarketValueCronStatus,
  pauseMarketValueScan,
  resumeMarketValueScan,
  retryMissingTransfermarktSquads,
  startMarketValueScan,
  type CronRunStatus,
} from "@/app/actions/market-value-cron"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 5000
const PHASES = [
  { key: "tm_leagues", label: "Transfermarkt ligleri" },
  { key: "tm_players", label: "Transfermarkt oyuncuları" },
  { key: "af_leagues", label: "API-Football ligleri" },
  { key: "af_teams", label: "API-Football takımları" },
  { key: "af_players", label: "API-Football oyuncuları" },
  { key: "matching", label: "Eşleştirme ve yayınlama" },
] as const

const PHASE_LABELS = Object.fromEntries(PHASES.map((phase) => [phase.key, phase.label]))

function formatRelativeTime(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 10) return "az önce"
  if (seconds < 60) return `${seconds} saniye önce`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} dakika önce`
  return `${Math.floor(minutes / 60)} saat önce`
}

function formatTurkeyTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value))
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">{value.toLocaleString("tr-TR")}</span>
    </div>
  )
}

export function MarketValueCronStatus({ initialStatus }: { initialStatus: CronRunStatus | null }) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [message, setMessage] = useState<string | null>(null)
  const [pollError, setPollError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()

  useEffect(() => setStatus(initialStatus), [initialStatus])

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await getMarketValueCronStatus()
      setStatus(nextStatus)
      setPollError(false)
      setNow(Date.now())
      if (status?.status === "running" && nextStatus?.status !== "running") router.refresh()
    } catch {
      setPollError(true)
    }
  }, [router, status?.status])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus()
    }, POLL_INTERVAL_MS)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshStatus()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearInterval(clock)
      window.clearInterval(poll)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [refreshStatus])

  function runAction(action: () => Promise<{ status: CronRunStatus }>, successMessage: string) {
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await action()
        setStatus(result.status)
        setMessage(successMessage)
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı.")
      }
    })
  }

  const running = status?.status === "running"
  const paused = status?.status === "paused"
  const finished = status?.status === "done"
  const phaseIndex = status?.phase === "done" ? PHASES.length : PHASES.findIndex((phase) => phase.key === status?.phase)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseZap className="size-5" aria-hidden="true" />
          Piyasa değeri senkronizasyonu
        </CardTitle>
        <CardDescription>Transfermarkt ve API-Football verilerinin canlı işlem durumu.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Durumu yenile"
            disabled={isRefreshing}
            onClick={() => startRefreshTransition(() => void refreshStatus())}
          >
            <RefreshCw className={cn(isRefreshing && "animate-spin")} />
          </Button>
          {running && (
            <Button size="sm" variant="outline" onClick={() => status && runAction(() => pauseMarketValueScan(status.id), "Tarama durduruldu.")} disabled={isPending}>
              <PauseCircle data-icon="inline-start" />
              Durdur
            </Button>
          )}
          {paused && (
            <Button size="sm" variant="outline" onClick={() => status && runAction(() => resumeMarketValueScan(status.id), "Tarama kaldığı yerden devam ediyor.")} disabled={isPending}>
              <RotateCcw data-icon="inline-start" />
              Devam
            </Button>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!status ? (
          <div className="flex flex-col items-start gap-3 py-3">
            <p className="text-sm text-muted-foreground">Henüz tarama başlatılmadı.</p>
            <Button size="sm" onClick={() => runAction(startMarketValueScan, "Yeni tarama başlatıldı.")} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
              Taramayı Başlat
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.lastError || status.isStale ? "destructive" : finished ? "default" : "secondary"}>
                {status.lastError || status.isStale ? <AlertTriangle data-icon="inline-start" /> : finished ? <Check data-icon="inline-start" /> : paused ? <PauseCircle data-icon="inline-start" /> : <Loader2 className="animate-spin" data-icon="inline-start" />}
                {status.lastError ? "Hata" : status.isStale ? "Yanıt bekleniyor" : finished ? "Tamamlandı" : paused ? "Durduruldu" : "Canlı çalışıyor"}
              </Badge>
              <span className="text-sm font-medium">{status.phase === "done" ? "Tüm aşamalar tamamlandı" : PHASE_LABELS[status.phase] ?? status.phase}</span>
            </div>

            <Progress value={status.progress.percent} aria-label="Aktif aşama ilerlemesi">
              <ProgressLabel>{status.currentItem ? `Şu an: ${status.currentItem}` : "Aktif aşama"}</ProgressLabel>
              <ProgressValue>{() => `${status.progress.current}/${status.progress.total} ${status.progress.unit} · %${status.progress.percent}`}</ProgressValue>
            </Progress>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
              <Metric label="TM takımları" value={status.staging.transfermarktTeams} />
              <Metric label="TM oyuncuları" value={status.staging.transfermarktPlayers} />
              <Metric label="API takımları" value={status.staging.apiFootballTeams} />
              <Metric label="API oyuncuları" value={status.staging.apiFootballPlayers} />
              <Metric label="Eksik TM kadrosu" value={status.staging.missingTransfermarktSquads} />
              <Metric label="İnceleme bekleyen" value={status.results.pendingReviews} />
            </div>

            <Separator />

            <div className="flex flex-col gap-3" aria-label="Senkronizasyon aşamaları">
              {PHASES.map((phase, index) => {
                const complete = index < phaseIndex || finished
                const active = index === phaseIndex && !finished
                return (
                  <div key={phase.key} className="flex items-center gap-3 text-sm">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", complete && "border-primary bg-primary text-primary-foreground", active && "border-primary text-primary")}>
                      {complete ? <Check className="size-3.5" aria-hidden="true" /> : active ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Circle className="size-2.5" aria-hidden="true" />}
                    </span>
                    <span className={cn("flex-1", !complete && !active && "text-muted-foreground", active && "font-medium")}>{phase.label}</span>
                    {complete && <span className="text-xs text-muted-foreground">Tamamlandı</span>}
                    {active && <span className="text-xs text-muted-foreground">Aktif</span>}
                  </div>
                )
              })}
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-2">
              <Metric label="Yayınlanan lig" value={status.results.leagues} />
              <Metric label="Yayınlanan takım" value={status.results.teams} />
              <Metric label="Yayınlanan oyuncu" value={status.results.players} />
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Clock3 className="size-4" aria-hidden="true" />
              <span>Son hareket {formatRelativeTime(status.heartbeatAt, now)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatTurkeyTime(status.heartbeatAt)} (TR)</span>
              <span aria-hidden="true">·</span>
              <span>5 saniyede bir yenilenir</span>
            </div>

            {status.isStale && !status.lastError && <p className="text-sm text-destructive">Son 3 dakikadır ilerleme alınamadı. Worker yeni tetikleyiciyi bekliyor olabilir.</p>}
            {status.lastError && <p className="text-sm text-destructive">{status.lastError}</p>}
            {pollError && <p className="text-sm text-destructive">Canlı durum alınamadı. Manuel yenilemeyi deneyin.</p>}
          </>
        )}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>

      {status && (
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {!running && status.staging.missingTransfermarktSquads > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAction(() => retryMissingTransfermarktSquads(status.id), "Eksik Transfermarkt kadroları tamamlanıyor; ardından eşleştirme yeniden çalışacak.")}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              Eksik Kadroları Tamamla
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => runAction(startMarketValueScan, "Eski veriler temizlendi ve yeni tarama başlatıldı.")} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
            Sıfırdan Başlat
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
