"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, RotateCcw, Timer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  resumeMarketValueCronNow,
  triggerMarketValueScanNow,
  type CronRunStatus,
} from "@/app/actions/market-value-cron"

// ---------------------------------------------------------------------------
// Haftalık piyasa değeri cron döngüsünün ("23 lig zincirleme işleniyor" —
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
}

export function MarketValueCronStatus({ initialStatus }: { initialStatus: CronRunStatus | null }) {
  const [status, setStatus] = useState(initialStatus)
  const [isResuming, startResumeTransition] = useTransition()
  const [isScanning, startScanTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const isBroken = status !== null && status.status === "running" && status.isStale
  const isHealthyRunning = status !== null && status.status === "running" && !status.isStale

  function handleResume() {
    setMessage(null)
    startResumeTransition(async () => {
      const result = await resumeMarketValueCronNow()
      if (result.triggered) {
        setMessage("Devam ettirme tetiklendi — birkaç saniye içinde ilerlemeye başlayacak.")
      } else {
        setMessage(result.reason ?? "Devam ettirilemedi.")
      }
    })
  }

  function handleScanNow() {
    setMessage(null)
    startScanTransition(async () => {
      const result = await triggerMarketValueScanNow()
      if (result.triggered) {
        setMessage("Tarama tetiklendi — birkaç saniye içinde ilerlemeye başlayacak, bu kartı yenileyerek takip edebilirsiniz.")
      } else {
        setMessage(result.reason ?? "Tarama tetiklenemedi.")
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
          Piyasa değeri senkron durumu
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
          Şimdi Tara
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status === null ? (
          <p className="text-sm text-muted-foreground">
            Henüz hiç tarama çalıştırılmadı. Haftalık otomatik taramayı beklemek istemiyorsanız &quot;Şimdi Tara&quot;
            butonuyla hemen başlatabilirsiniz.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isBroken ? "destructive" : "outline"}>
                {status.status === "running" ? (isBroken ? "Zincir kırıldı" : "Çalışıyor") : "Tamamlandı"}
              </Badge>
              <span className="text-muted-foreground">
                {status.currentLeagueIndex}/{status.totalLeagues} lig işlendi
              </span>
              {status.hadErrors && (
                <Badge variant="secondary" className="gap-1">
                  <Timer className="size-3" />
                  {status.failedLeagueIds.length} lig başarısız
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Döngü başlangıcı: {formatDateTime(status.runStartedAt)} · Son heartbeat:{" "}
              {formatDateTime(status.heartbeatAt)}
            </p>

            {isBroken && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-destructive">
                  Zincir {Math.round((Date.now() - new Date(status.heartbeatAt).getTime()) / 60000)} dakikadır
                  ilerlemedi. Otomatik bir devam ettirme yapılmaz — devam etmesi için aşağıdaki butonla manuel olarak
                  tetiklemeniz gerekir.
                </p>
                <Button size="sm" variant="outline" disabled={isResuming} onClick={handleResume} className="shrink-0">
                  {isResuming ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <RotateCcw data-icon="inline-start" />
                  )}
                  Devam Ettir
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
