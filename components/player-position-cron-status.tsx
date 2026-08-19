"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, StopCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/contexts/language-context"
import { getPlayerPositionCronStatus, type PlayerPositionCronStatus } from "@/app/actions/player-position-cron"

// ---------------------------------------------------------------------------
// Oyuncu mevki (Transfermarkt "Main position"/"Other position") backfill'inin
// (bkz. app/api/cron/backfill-player-positions, lib/player-position-sync.ts)
// durumunu gösterir VE tetikler.
//
// ÖNEMLİ MİMARİ — bu route'a HİÇBİR otomatik/zamanlanmış tetikleyici YOK
// (önceden bir GitHub Actions cron'u vardı, ama admin bunu istemedi — tarama
// SADECE admin "Şimdi Tara"ya bastığında çalışsın istedi, kendiliğinden
// sürekli arka planda dönmesin). Bu yüzden o workflow tamamen kaldırıldı.
//
// Bunun yerine "Şimdi Tara" butonu, TARAYICIDAN doğrudan app/api/cron/
// backfill-player-positions route'una fetch atar (aynı origin, admin oturum
// çerezi otomatik dahil olur — route artık bu çerezi kabul ediyor, CRON_
// SECRET'i istemciye göndermemize gerek yok). Bu route her çağrıda tek bir
// batch (~250s, ~150-165 oyuncu) işleyip döner; batch bitmeden taramanın
// tamamı bitmiyorsa, bu bileşen SEKME AÇIK OLDUĞU SÜRECE otomatik olarak bir
// sonraki batch'i tetikler (basit bir client-side döngü) — admin "Durdur"a
// basarsa veya sekmeyi kapatırsa döngü hemen durur, hiçbir şey arka planda
// devam etmez. Yani sistem tamamen admin'in kontrolünde.
// ---------------------------------------------------------------------------

const BATCH_ENDPOINT = "/api/cron/backfill-player-positions"

interface BatchResult {
  done: boolean
  processed: number
  matched: number
  remaining: number
}

export function PlayerPositionCronStatus({ initialStatus }: { initialStatus: PlayerPositionCronStatus }) {
  const { locale, t } = useLanguage()
  const [status, setStatus] = useState(initialStatus)
  const [isScanning, setIsScanning] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // `continueRef` — döngünün "devam et" bayrağı. State DEĞİL bilerek ref:
  // döngü içindeki `while` koşulu her iterasyonda anlık son değeri okumalı,
  // bir React render'ının tamamlanmasını beklememeli.
  const continueRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      // Bileşen unmount olursa (admin başka bir sayfaya geçerse) döngü bir
      // sonraki iterasyonun başında kendini durdurur — hiçbir şey admin
      // ayrıldıktan sonra da çalışmaya devam etmez.
      mountedRef.current = false
      continueRef.current = false
    }
  }, [])

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  }

  const isBroken = status.hasRun && status.status === "running" && status.isStale && !isScanning
  const isHealthyRunning = status.hasRun && status.status === "running" && !status.isStale && !isScanning

  async function runScanLoop() {
    continueRef.current = true
    setIsScanning(true)
    setStopRequested(false)
    setMessage(null)

    try {
      while (continueRef.current) {
        const response = await fetch(BATCH_ENDPOINT, { cache: "no-store" })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          const detail = body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`
          throw new Error(detail)
        }

        const result = (await response.json()) as BatchResult

        if (mountedRef.current) {
          const fresh = await getPlayerPositionCronStatus()
          if (mountedRef.current) setStatus(fresh)
        }

        if (result.done || !continueRef.current) break
      }
    } catch (err) {
      console.error("[v0] Mevki tarama isteği başarısız:", err)
      if (mountedRef.current) {
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`${t("admin.playerPositionCron.scanFailedDefault")} (${detail})`)
      }
    } finally {
      continueRef.current = false
      if (mountedRef.current) {
        setIsScanning(false)
        setStopRequested(false)
      }
    }
  }

  function handleScanNow() {
    if (isScanning || status.isDone) return
    runScanLoop()
  }

  function handleStop() {
    // Devam eden tek bir batch isteği zaten tarayıcıdan gitmiş durumda —
    // onu iptal etmiyoruz (kendi hâlinde bitip veriyi kaydetsin), sadece bu
    // batch bitince YENİ bir batch başlatılmasını önlüyoruz.
    continueRef.current = false
    setStopRequested(true)
  }

  return (
    <Card className={isBroken ? "border-destructive/50" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {isBroken ? (
            <AlertTriangle className="size-4 text-destructive" />
          ) : isScanning || isHealthyRunning ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <CheckCircle2 className="size-4 text-muted-foreground" />
          )}
          {t("admin.playerPositionCron.heading")}
        </CardTitle>
        {isScanning ? (
          <Button size="sm" variant="destructive" disabled={stopRequested} onClick={handleStop} className="shrink-0">
            {stopRequested ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <StopCircle data-icon="inline-start" />
            )}
            {stopRequested ? t("admin.playerPositionCron.stopping") : t("admin.playerPositionCron.stopScan")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isHealthyRunning || status.isDone}
            onClick={handleScanNow}
            className="shrink-0"
          >
            <PlayCircle data-icon="inline-start" />
            {t("admin.playerPositionCron.scanNow")}
          </Button>
        )}
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
                    : isScanning || status.status === "running"
                      ? t("admin.playerPositionCron.statusRunning")
                      : t("admin.playerPositionCron.statusIdle")}
              </Badge>
              <span className="text-muted-foreground">
                {t("admin.playerPositionCron.remaining", { count: status.remainingCandidates })}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {isScanning
                ? t("admin.playerPositionCron.currentlyProcessing", {
                    date: status.runStartedAt ? formatDateTime(status.runStartedAt) : "—",
                  })
                : t("admin.playerPositionCron.lastBatch", {
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
