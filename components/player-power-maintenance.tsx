"use client"

import { useState, useTransition } from "react"
import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/contexts/language-context"
import { resetPlayerPowerNow, recomputePlayerPowerNow } from "@/app/actions/player-power-admin"

// ---------------------------------------------------------------------------
// Oyuncu güç motoru (player_power) için iki manuel bakım butonu — bkz.
// app/actions/player-power-admin.ts. İkisi de dış API'ye gitmez, sadece
// DB'deki mevcut veriyi (piyasa değeri + biriken sezon rating) okur/yazar.
//
// "Sıfırla": tüm satırların güç alanlarını literal 0'a çeker (satırları
// SİLMEZ). "Yeniden Hesapla": tüm satırların gücünü güncel piyasa değeri +
// biriken rating'den yeniden hesaplayıp DOĞRUDAN ÜSTÜNE YAZAR — silmeden de
// çalıştırılabilir, her zaman overwrite eder (örn. 90 -> 91).
// ---------------------------------------------------------------------------

export function PlayerPowerMaintenance() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [isResetting, startResetTransition] = useTransition()
  const [isRecomputing, startRecomputeTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleReset() {
    setError(null)
    setMessage(null)
    startResetTransition(async () => {
      try {
        const result = await resetPlayerPowerNow()
        setMessage(t("admin.playerPowerMaintenance.resetTriggered", { count: result.resetCount }))
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.playerPowerMaintenance.resetFailedDefault"))
      }
    })
  }

  function handleRecompute() {
    setError(null)
    setMessage(null)
    startRecomputeTransition(async () => {
      try {
        const result = await recomputePlayerPowerNow()
        setMessage(t("admin.playerPowerMaintenance.recomputeTriggered", { count: result.updated }))
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.playerPowerMaintenance.recomputeFailedDefault"))
      }
    })
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="size-4" />
          {t("admin.playerPowerMaintenance.heading")}
        </CardTitle>
        <CardDescription>{t("admin.playerPowerMaintenance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t("admin.playerPowerMaintenance.recomputeDescription")}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={isRecomputing}
            onClick={handleRecompute}
            className="shrink-0"
          >
            {isRecomputing ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            {t("admin.playerPowerMaintenance.recompute")}
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t("admin.playerPowerMaintenance.resetDescription")}</p>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm" className="shrink-0">
                  <Trash2 data-icon="inline-start" />
                  {t("admin.playerPowerMaintenance.resetAll")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("admin.playerPowerMaintenance.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("admin.playerPowerMaintenance.confirmDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isResetting}>{t("admin.playerPowerMaintenance.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isResetting}
                  onClick={(e) => {
                    e.preventDefault()
                    handleReset()
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isResetting ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Trash2 data-icon="inline-start" />
                  )}
                  {t("admin.playerPowerMaintenance.confirmReset")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
