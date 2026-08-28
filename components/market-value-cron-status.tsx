"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, DatabaseZap, Loader2, PauseCircle, PlayCircle, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getMarketValueCronStatus, pauseMarketValueScan, resumeMarketValueScan, startMarketValueScan, type CronRunStatus } from "@/app/actions/market-value-cron"

const POLL_INTERVAL_MS = 5000
const PHASE_LABELS: Record<string, string> = {
  tm_leagues: "Transfermarkt lig ve takımları",
  tm_players: "Transfermarkt oyuncuları",
  af_leagues: "API-Football ligleri",
  af_teams: "API-Football takımları",
  af_players: "API-Football oyuncuları",
  matching: "Eşleştirme",
  done: "Tamamlandı",
}

export function MarketValueCronStatus({ initialStatus }: { initialStatus: CronRunStatus | null }) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    if (status?.status !== "running") return
    const timer = setInterval(() => {
      void getMarketValueCronStatus()
        .then((nextStatus) => {
          setStatus(nextStatus)
          if (nextStatus?.status !== "running") router.refresh()
        })
        .catch(() => undefined)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [router, status?.status])

  function handleStart() {
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await startMarketValueScan()
        setStatus(result.status)
        setMessage("Tüm eski veriler temizlendi. Yeni tarama sıfırdan başlatıldı.")
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Tarama başlatılamadı.")
      }
    })
  }

  function handlePause() {
    if (!status) return
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await pauseMarketValueScan(status.id)
        setStatus(result.status)
        setMessage("Tarama mevcut adım tamamlandıktan sonra durduruldu.")
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Tarama durdurulamadı.")
      }
    })
  }

  function handleResume() {
    if (!status) return
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await resumeMarketValueScan(status.id)
        setStatus(result.status)
        setMessage("Tarama kaldığı yerden devam ediyor.")
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Tarama devam ettirilemedi.")
      }
    })
  }

  const running = status?.status === "running"
  const paused = status?.status === "paused"
  const finished = status?.status === "done"

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseZap />
            Piyasa değeri senkronizasyonu
          </CardTitle>
          <CardDescription>27 lig, iki kaynak ve 75 puanlık otomatik eşleştirme eşiği.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {running && (
            <Button size="sm" variant="outline" onClick={handlePause} disabled={isPending}>
              <PauseCircle data-icon="inline-start" />
              Durdur
            </Button>
          )}
          {paused && (
            <Button size="sm" variant="outline" onClick={handleResume} disabled={isPending}>
              <RotateCcw data-icon="inline-start" />
              Devam Ettir
            </Button>
          )}
          <Button size="sm" onClick={handleStart} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
            Taramayı Başlat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!status ? (
          <p className="text-sm text-muted-foreground">Henüz tarama başlatılmadı.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.lastError ? "destructive" : "secondary"}>
                {status.lastError ? <AlertTriangle data-icon="inline-start" /> : finished ? <CheckCircle2 data-icon="inline-start" /> : paused ? <PauseCircle data-icon="inline-start" /> : <Loader2 className="animate-spin" data-icon="inline-start" />}
                {status.lastError ? "Adım yeniden denenecek" : finished ? "Tamamlandı" : paused ? "Durduruldu" : "Çalışıyor"}
              </Badge>
              <span className="text-sm font-medium">{PHASE_LABELS[status.phase] ?? status.phase}</span>
              <span className="text-sm text-muted-foreground">Lig {Math.min(status.currentLeagueIndex + 1, status.totalLeagues)}/{status.totalLeagues}</span>
            </div>
            <p className="text-xs text-muted-foreground">Son ilerleme: {new Date(status.heartbeatAt).toLocaleString("tr-TR")}</p>
            {status.lastError && <p className="text-sm text-destructive">{status.lastError}</p>}
          </>
        )}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
