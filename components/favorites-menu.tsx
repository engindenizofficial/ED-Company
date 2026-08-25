"use client"

import { Menu } from "lucide-react"
import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import { useLanguage } from "@/contexts/language-context"

// Ağır bağımlılıklar (özellikle @dnd-kit/*, ThemeColorPicker, hesap silme
// akışı) artık components/favorites-menu-panel.tsx'e taşındı ve buradan
// next/dynamic ile yüklenir. Bu bileşen (NavTabs üzerinden) HER sayfada
// eager render edildiği için, önceden panel içeriği açık/kapalı fark
// etmeksizin ana JS paketine gömülüyor, Lighthouse'un "Kullanılmayan
// JavaScript" ve "Ana iş parçacığı çalışması" uyarılarına katkı
// sağlıyordu. Artık panel chunk'ı sadece kullanıcı menüyü AÇTIĞINDA
// (open=true) indirilir — görünüm ve davranış hiç değişmez.
const FavoritesMenuPanel = dynamic(
  () => import("@/components/favorites-menu-panel").then((m) => m.FavoritesMenuPanel),
  { ssr: false },
)

export function FavoritesMenu() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={t("menu.openMenu")}
        className="flex items-center justify-center rounded-lg p-2 -ml-1 text-foreground/90 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? <FavoritesMenuPanel onRequestClose={handleClose} /> : null}
    </>
  )
}
