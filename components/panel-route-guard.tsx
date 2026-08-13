"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { usePlayerPanel } from "@/contexts/player-context"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"

/**
 * Oyuncu/takım/lig panelleri kök layout'ta render edildiği için sayfa (route)
 * değişse bile React state'te açık kalabiliyor — örneğin Ana Sayfa'da bir
 * takım kartı açıkken "Oyunlar" sekmesine geçildiğinde panel, yeni sayfanın
 * üzerinde açık kalıyordu. Bu hem kafa karıştırıcı hem de panel açılırken
 * eklenen "sanal" geçmiş girdisinin gerçek sayfa geçişleriyle karışıp geri
 * tuşunun beklenmedik davranmasına (örn. Oyunlar'da geri tuşuna basınca
 * doğrudan siteden çıkılması) yol açabiliyordu. Bu yüzden her gerçek sayfa
 * geçişinde açık panelleri otomatik olarak kapatıyoruz.
 */
export function PanelRouteGuard() {
  const pathname = usePathname()
  const { panel: playerPanel, closePlayer } = usePlayerPanel()
  const { panel: teamPanel, closeTeam } = useTeamPanel()
  const { panel: leaguePanel, closeLeague } = useLeaguePanel()
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    if (playerPanel) closePlayer()
    if (teamPanel) closeTeam()
    if (leaguePanel) closeLeague()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
