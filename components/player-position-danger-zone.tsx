"use client"

import { useState, useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
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
import { resetAllPlayerPositionData } from "@/app/actions/player-position-cron"

// ---------------------------------------------------------------------------
// Piyasa değeri "Tehlikeli Bölge"siyle (market-value-danger-zone.tsx) AYNI
// desen: çekilmiş TÜM oyuncu mevki verilerini (player_position) ve backfill
// çalışma günlüğünü kalıcı olarak siler — bkz. resetAllPlayerPositionData
// (app/actions/player-position-cron.ts). Geri alınamaz bir işlem olduğu için
// AlertDialog ile onay istenir.
// ---------------------------------------------------------------------------

export function PlayerPositionDangerZone() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await resetAllPlayerPositionData()
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.playerPositionDangerZone.deleteFailedDefault"))
      }
    })
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="size-4" />
          {t("admin.playerPositionDangerZone.heading")}
        </CardTitle>
        <CardDescription>{t("admin.playerPositionDangerZone.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 data-icon="inline-start" />
                {t("admin.playerPositionDangerZone.resetAll")}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("admin.playerPositionDangerZone.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("admin.playerPositionDangerZone.confirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>{t("admin.playerPositionDangerZone.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPending}
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirm()
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Trash2 data-icon="inline-start" />
                )}
                {t("admin.playerPositionDangerZone.confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
