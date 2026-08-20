"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Timer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/contexts/language-context"
import { getMarketValueCronStatus, triggerMarketValueScanNow, type CronRunStatus } from "@/app/actions/market-value-cron"

// Kart, sunucudan sadece ilk yüklemede bir kez `initialStatus` alır ve onu
// `useState` ile local state'e alır — React, prop değişse de bu başlangıç
// değerini tekrar uygulamaz. Yani "Şimdi Tara"ya bastıktan sonra arka planda
// tarama gerçekten ilerlese bile, admin manuel olarak tam sayfa yenilemesi
// (F5) yapmadan kartta HİÇBİR ŞEY değişmez. Bunu çözmek için, tarama/devam
// ettirme tetiklendiğinde veya zaten "running" bir döngü varken durumu
// periyodik olarak sunucudan tazeliyoruz.
const POLL_INTERVAL_MS = 4000

// ---------------------------------------------------------------------------
// Haftalık piyasa değeri cron döngüsünün ("24 lig zincirleme işleniyor" —
// bkz. app/api/cron/update-market-values) son çalışmasının durumunu gösterir.
// Zincir kırılırsa (crash, zaman aşımı, ağ hatası) admin burada hangi ligde
// kalındığını görür ve "Devam Ettir" ile anında devam ettirebilir (bkz.
// app/actions/market-value-cron.ts). Bunu tetikleyen otomatik bir zamanlama
// yoktur — devam ettirme yalnızca bu buton ile yapılır.
//
// "Şimdi Tara" butonu, aynı tam taramayı admin isteğiyle anında başlatır —
// sağlıklı ilerleyen bir döngü varsa ikinci bir tanesi başlatılmaz. Bu
// tarama artık SADECE bu buton ile başlar (otomatik haftalık zamanlama
// kaldırıldı, bkz. vercel.json).
// ---------------------------------------------------------------------------

export function MarketValueCronStatus({ initialStatus }: { initialStatus: CronRunStatus | null }) {
  const { locale, t } = useLanguage()
  const [status, setStatus] = useState(initialStatus)
  const [isResuming, startResumeTransition] = useTransition()
  const [isScanning, startScanTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  // Butona basıldıktan sonra (veya sayfa yüklendiğinde zaten koşan bir döngü
  // varken) durumu periyodik olarak tazele — böylece admin, ilerlemeyi
  // görmek için sayfayı manuel yenilemek zorunda kalmaz.
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    const shouldPoll = () =>
      isScanning || isResuming || (statusRef.current !== null && statusRef.current.status === "running")

    if (!shouldPoll()) return

    const interval = setInterval(async () => {
      if (!shouldPoll()) return
      try {
        const fresh = await getMarketValueCronStatus()
        setStatus(fresh)
      } catch (err) {
        console.error("[v0] Durum tazelenemedi:", err)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isScanning, isResuming, status?.status])

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

  // ÖNEMLİ — bu iki handler'da ÖNCEDEN try/catch yoktu. Server action
  // (requireAdmin() içinde) "Unauthorized" gibi bir hata fırlattığında, bu
  // hata startResumeTransition/startScanTransition'ın async callback'i
  // içinde YAKALANMADAN reddedilen bir promise olarak kalıyordu — React bunu
  // sessizce yutuyor, buton kısa süre spinner gösterip normale dönüyor ama
  // `message` hiç güncellenmiyordu. Admin butona bastığında (örn. oturumu
  // sona ermişse) EKRANDA HİÇBİR ŞEY DEĞİŞMİYORDU — sanki tıklama hiç
  // olmamış gibi görünüyordu. Şimdi hata her durumda `message`'a yazılıyor.
  function handleResume() {
    setMessage(null)
    startResumeTransition(async () => {
      try {
        const result = await resumeMarketValueCronNow()
        if (result.triggered) {
          setMessage(t("admin.cron.resumeTriggered"))
          // Zincir DB satırını hemen güncellemeye başlar — kısa bir gecikmeden
          // sonra bir kez tazeleyerek admin sayfayı elle yenilemek zorunda
          // kalmadan ilk ilerlemeyi görsün (periyodik polling zaten devam eder).
          setTimeout(() => {
            getMarketValueCronStatus().then(setStatus).catch(() => {})
          }, 1500)
        } else {
          setMessage(translateReason(result.reason, "admin.cron.resumeFailedDefault"))
        }
      } catch (err) {
        console.error("[v0] Devam ettirme isteği başarısız:", err)
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`${t("admin.cron.resumeFailedDefault")} (${detail})`)
      }
    })
  }

  function handleScanNow() {
    setMessage(null)
    startScanTransition(async () => {
      try {
        const result = await triggerMarketValueScanNow()
        if (result.triggered) {
          setMessage(t("admin.cron.scanTriggered"))
          setTimeout(() => {
            getMarketValueCronStatus().then(setStatus).catch(() => {})
          }, 1500)
        } else {
          setMessage(translateReason(result.reason, "admin.cron.scanFailedDefault"))
        }
      } catch (err) {
        console.error("[v0] Tarama isteği başarısız:", err)
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`${t("admin.cron.scanFailedDefault")} (${detail})`)
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

            {/*
              ÖNEMLİ — bu blok ÖNCEDEN yoktu: zincirin bir sonraki adımını
              tetikleyen self-fetch tüm denemelerden sonra başarısız olduğunda
              (örn. VERCEL_AUTOMATION_BYPASS_SECRET eksikken "HTTP 401") gerçek
              sebep sadece sunucu loglarında kalıyordu, admin panelinde SADECE
              "zincir kırıldı / heartbeat eskimiş" görünüyordu — asıl sebep hiç
              görünmüyordu. Artık status.lastChainError (bkz.
              lib/market-value-cron-run.ts -> setChainError) doğrudan burada
              gösteriliyor.
            */}
            {status.lastChainError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs font-medium text-destructive">{t("admin.cron.lastChainErrorLabel")}</p>
                <p className="mt-1 break-all text-xs text-destructive/90">{status.lastChainError}</p>
                {status.lastChainErrorAt && (
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(status.lastChainErrorAt)}</p>
                )}
              </div>
            )}
          </>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}
