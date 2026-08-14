"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, RotateCcw, Timer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/contexts/language-context"
import {
  resumeMarketValueCronNow,
  triggerMarketValueScanNow,
  type CronRunStatus,
} from "@/app/actions/market-value-cron"

// ---------------------------------------------------------------------------
// Haftalık piyasa değeri cron döngüsünün ("24 lig zincirleme işleniyor" —
// bkz. app/api/cron/update-market-values) son çalışmasının durumunu gösterir.
// Zincir kırılırsa (crash, zaman aşımı, ağ hatası) admin burada hangi ligde
// kalındığını görür ve "Devam Ettir" ile anında devam ettirebilir (bkz.
// app/actions/market-value-cron.ts). Bunu tetikleyen otomatik bir zamanlama
// yoktur — devam ettirme yalnızca bu buton ile yapılır.
//
// "Şimdi Tara" butonu, haftalık Vercel Cron tetiklemesini (her Çarşamba)
// beklemeden aynı tam taramayı admin isteğiyle anında başlatır — sağlıklı
// ilerleyen bir döngü varsa ikinci bir tanesi başlatılmaz.
// ---------------------------------------------------------------------------

export function MarketValueCronStatus({ initialStatus }: { initialStatus: CronRunStatus | null }) {
  const { locale, t } = useLanguage()
  const [status, setStatus] = useState(initialStatus)
  const [isResuming, startResumeTransition] = useTransition()
  const [isScanning, startScanTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  }

  const isBroken = status !== null && status.status === "running" && status.isStale
  const isHealthyRunning = status !== null && status.status === "running" && !status.isStale

  // Server action'lar artık ham metin yerine sabit "reason" kodları döndürüyor
  // (örn. "noActiveRun"); burada aktif dile çeviriyoruz.
  const REASON_KEYS: Record<string, string> = {
    noActiveRun: "admin.cron.reasonNoActiveRun",
    runHealthy: "admin.cron.reasonRunHealthy",
    triggerFailed: "admin.cron.reasonTriggerFailed",
    scanAlreadyRunning: "admin.cron.reasonScanAlreadyRunning",
  }

  function translateReason(reason: string | undefined, fallbackKey: string): string {
    if (reason && REASON_KEYS[reason]) return t(REASON_KEYS[reason])
    return t(fallbackKey)
  }

  function handleResume() {
    setMessage(null)
    startResumeTransition(async () => {
      const result = await resumeMarketValueCronNow()
      if (result.triggered) {
        setMessage(t("admin.cron.resumeTriggered"))
      } else {
        setMessage(translateReason(result.reason, "admin.cron.resumeFailedDefault"))
      }
    })
  }

  function handleScanNow() {
    setMessage(null)
    startScanTransition(async () => {
      const result = await triggerMarketValueScanNow()
      if (result.triggered) {
        setMessage(t("admin.cron.scanTriggered"))
      } else {
        setMessage(translateReason(result.reason, "admin.cron.scanFailedDefault"))
      }
    })
  }

  return (
    <Card className={isBroken ? "border-destructive/50" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {isBroken ? (
            <AlertTriangle className="size-4 text-destructive" />
          ) : isHealthyRunning ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : status?.hadErrors ? (
            <AlertTriangle className="size-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 text-muted-foreground" />
          )}
          {t("admin.cron.heading")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={isScanning || isHealthyRunning}
          onClick={handleScanNow}
          className="shrink-0"
        >
          {isScanning ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <PlayCircle data-icon="inline-start" />
          )}
          {t("admin.cron.scanNow")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status === null ? (
          <p className="text-sm text-muted-foreground">{t("admin.cron.neverRun")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isBroken ? "destructive" : "outline"}>
                {status.status === "running"
                  ? isBroken
                    ? t("admin.cron.statusBroken")
                    : t("admin.cron.statusRunning")
                  : t("admin.cron.statusCompleted")}
              </Badge>
              <span className="text-muted-foreground">
                {t("admin.cron.leaguesProcessed", {
                  current: status.currentLeagueIndex,
                  total: status.totalLeagues,
                })}
              </span>
              {status.hadErrors && (
                <Badge variant="secondary" className="gap-1">
                  <Timer className="size-3" />
                  {t("admin.cron.leaguesFailed", { count: status.failedLeagueIds.length })}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t("admin.cron.cycleStart", {
                date: formatDateTime(status.runStartedAt),
                heartbeat: formatDateTime(status.heartbeatAt),
              })}
            </p>

            {isBroken && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-destructive">
                  {t("admin.cron.brokenWarning", {
                    minutes: Math.round((Date.now() - new Date(status.heartbeatAt).getTime()) / 60000),
                  })}
                </p>
                <Button size="sm" variant="outline" disabled={isResuming} onClick={handleResume} className="shrink-0">
                  {isResuming ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <RotateCcw data-icon="inline-start" />
                  )}
                  {t("admin.cron.resume")}
                </Button>
              </div>
            )}
          </>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
