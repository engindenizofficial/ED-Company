"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { usePlayerPanel } from "@/contexts/player-context"

interface PlayerUrlOpenerProps {
  id: number
  name: string
  photo: string | null
}

/**
 * /oyuncu/[id] sayfası, doğrudan ziyaret / yenileme / paylaşılan link için
 * var olan "gerçek" bir route — kendi görsel içeriği yok, sadece mevcut
 * global oyuncu panelini (PlayerPanel, kök layout'ta render edilir) açar.
 * Panel her yerden (arama, favoriler, başka bir panel içinden) aynı şekilde
 * açıldığı için burada da aynı context fonksiyonu kullanılıyor — mantık
 * ikinci kez yazılmıyor.
 */
export function PlayerUrlOpener({ id, name, photo }: PlayerUrlOpenerProps) {
  const router = useRouter()
  const { panel, openPlayer } = usePlayerPanel()
  // Panel bu ID ile en az bir kez eşleşti mi? (openPlayer() ile biz açtık ya
  // da başka bir yerden zaten açıktı.) Bunu SADECE panel state'ini gözleyen
  // effect'te true'ya çeviriyoruz — openPlayer() bir async fetch başlattığı
  // için panel bu component mount olduğunda henüz eşleşmemiş olabilir; bu
  // yüzden "biz açtık" branch'ine hiç girmeden bu ref true olmayabiliyordu ve
  // kapatınca ana sayfaya yönlendirme hiç tetiklenmiyordu.
  const hasOpenedRef = useRef(false)

  useEffect(() => {
    if (panel?.player.id !== id) {
      openPlayer({ id, name, photo })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (panel?.player.id === id) {
      hasOpenedRef.current = true
      return
    }
    // Panel bir kez açıldıktan sonra kapatıldıysa (X butonu ya da geri
    // tuşuyla) bu sayfanın kendisi gösterecek bir içeriğe sahip değil —
    // kullanıcıyı ana sayfaya yönlendiriyoruz.
    if (hasOpenedRef.current) {
      router.replace("/")
    }
  }, [panel, id, router])

  return null
}
