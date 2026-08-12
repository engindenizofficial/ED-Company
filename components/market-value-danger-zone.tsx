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
import { resetAllMarketValueData } from "@/app/actions/market-value-cron"

// ---------------------------------------------------------------------------
// Piyasa değeri sistemine ait TÜM verileri (takım/oyuncu piyasa değerleri,
// onay/red kuyruğu, tarama döngüsü kayıtları) kalıcı olarak siler — bkz.
// resetAllMarketValueData (app/actions/market-value-cron.ts). Geri alınamaz
// bir işlem olduğu için AlertDialog ile onay istenir.
//
// Silme sonrası sayfayı tam olarak yeniden yükleriz: MarketValueReviewBoard
// kendi durumunu (statusById) sadece ilk mount'ta props'tan alıyor, bu yüzden
// router.refresh() tek başına listeyi boşaltmaz — window.location.reload()
// ile tüm sayfa (ve alt bileşenlerin state'i) sıfırdan kurulur.
// ---------------------------------------------------------------------------

export function MarketValueDangerZone() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await resetAllMarketValueData()
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Silme işlemi başarısız oldu.")
      }
    })
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="size-4" />
          Tehlikeli Bölge
        </CardTitle>
        <CardDescription>
          Tüm piyasa değeri verilerini (takım/oyuncu değerleri, onay/red listesi ve tarama geçmişi) kalıcı olarak
          siler. Bu işlem geri alınamaz — bir sonraki tarama her şeyi sıfırdan yeniden eşleştirir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 data-icon="inline-start" />
                Tümünü Sıfırla
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tüm piyasa değeri verileri silinsin mi?</AlertDialogTitle>
              <AlertDialogDescription>
                Bu işlem şunları kalıcı olarak siler: tüm takım ve oyuncu piyasa değerleri (onaylanmış/reddedilmiş
                eşleşmeler dahil), onay/red gözden geçirme listesi ve haftalık tarama döngüsü geçmişi. Bu işlem geri
                alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Vazgeç</AlertDialogCancel>
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
                Evet, tümünü sil
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
