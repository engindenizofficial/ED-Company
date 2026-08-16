"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/contexts/language-context"
import {
  getPlayerPositionCronStatus,
  triggerPlayerPositionScanNow,
  type PlayerPositionCronStatus,
} from "@/app/actions/player-position-cron"

// Piyasa değeri kartındaki (market-value-cron-status.tsx) AYNI polling
// deseni: "Şimdi Tara"ya bastıktan sonra arka planda backfill gerçekten
// ilerlese bile, admin manuel tam sayfa yenilemesi yapmadan kartta hiçbir
// şey değişmez. Bu yüzden tetikleme sonrası veya zaten "running" bir batch
// varken durumu periyodik olarak sunucudan tazeliyoruz.
const POLL_INTERVAL_MS = 4000

// ---------------------------------------------------------------------------
// Oyuncu mevki (Transfermarkt "Main position"/"Other position") backfill'inin
// (bkz. app/api/cron/backfill-player-positions, lib/player-position-sync.ts)
// durumunu gösterir. Bu route'a HİÇBİR zamanlanmış (vercel.json) tetikleme
// tanımlı değil — SADECE bu karttaki "Şimdi Tara" butonuyla (veya route'a
// manuel bir istekle) başlar.
// ---------------------------------------------------------------------------

export function PlayerPositionCronStatus({ initialStatus }: { initialStatus: PlayerPositionCronStatus }) {
  const { locale, t } = useLanguage()
  const [status, setStatus] = useState(initialStatus)
  const [isScanning, startScanTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    const shouldPoll = () => isScanning || statusRef.current.status === "running"

    if (!shouldPoll()) return

    const interval = setInterval(async () => {
      if (!shouldPoll()) return
      try {
        const fresh = await getPlayerPositionCronStatus()
        setStatus(fresh)
      } catch (err) {
        console.error("[v0] Mevki durumu tazelenemedi:", err)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isScanning, status.status])

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  }

  const isBroken = status.hasRun && status.status === "running" && status.isStale
  const isHealthyRunning = status.hasRun && status.status === "running" && !status.isStale

  const REASON_KEYS: Record<string, string> = {
    scanAlreadyRunning: "admin.playerPositionCron.reasonScanAlreadyRunning",
    noRemainingCandidates: "admin.playerPositionCron.reasonNoRemainingCandidates",
  }

  function translateReason(reason: string | undefined, fallbackKey: string): string {
    if (reason && REASON_KEYS[reason]) return t(REASON_KEYS[reason])
    return t(fallbackKey)
  }

  function handleScanNow() {
    setMessage(null)
    startScanTransition(async () => {
      try {
        const result = await triggerPlayerPositionScanNow()
        if (result.triggered) {
          setMessage(t("admin.playerPositionCron.scanTriggered"))
          setTimeout(() => {
            getPlayerPositionCronStatus().then(setStatus).catch(() => {})
          }, 1500)
        } else {
          setMessage(translateReason(result.reason, "admin.playerPositionCron.scanFailedDefault"))
        }
      } catch (err) {
        console.error("[v0] Mevki tarama isteği başarısız:", err)
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`${t("admin.playerPositionCron.scanFailedDefault")} (${detail})`)
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
          ) : (
            <CheckCircle2 className="size-4 text-muted-foreground" />
          )}
          {t("admin.playerPositionCron.heading")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={isScanning || isHealthyRunning || status.isDone}
          onClick={handleScanNow}
          className="shrink-0"
        >
          {isScanning ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <PlayCircle data-icon="inline-start" />
          )}
          {t("admin.playerPositionCron.scanNow")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!status.hasRun ? (
          <p className="text-sm text-muted-foreground">
            {t("admin.playerPositionCron.neverRun", { count: status.remainingCandidates })}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isBroken ? "destructive" : "outline"}>
                {status.isDone
                  ? t("admin.playerPositionCron.statusDone")
                  : isBroken
                    ? t("admin.playerPositionCron.statusBroken")
                    : status.status === "running"
                      ? t("admin.playerPositionCron.statusRunning")
                      : t("admin.playerPositionCron.statusIdle")}
              </Badge>
              <span className="text-muted-foreground">
                {t("admin.playerPositionCron.remaining", { count: status.remainingCandidates })}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("admin.playerPositionCron.lastBatch", {
                processed: status.playersProcessed,
                matched: status.playersMatched,
                date: status.runStartedAt ? formatDateTime(status.runStartedAt) : "—",
              })}
            </p>

            {status.lastError && (
              <p className="text-xs text-destructive">
                {t("admin.playerPositionCron.lastErrorLabel", { error: status.lastError })}
              </p>
            )}

            {isBroken && (
              <p className="text-xs text-destructive">{t("admin.playerPositionCron.brokenWarning")}</p>
            )}
          </>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
