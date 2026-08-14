"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { usePlayerPanel } from "@/contexts/player-context"
import { useTeamPanel } from "@/contexts/team-context"
import { useLeaguePanel } from "@/contexts/league-context"
import { useMatchPanel } from "@/contexts/match-context"

// Oyuncu/takım/lig/maç panelleri açıkken adres çubuğu bu desenlerden birine
// güncellenir (bkz. panel component'lerindeki useCloseOnBackButton çağrıları).
// Pathname bu desenlerden birine uyuyorsa, değişikliğin sebebi panelin
// KENDİSİ (açılışı ya da geri tuşuyla kapanışı) — bu durumda paneli tekrar
// kapatmaya çalışmamalıyız, aksi halde panel açılır açılmaz kendini kapatır.
const PANEL_URL_PATTERN = /^\/(oyuncu|takim|lig|mac)\/\d+$/

/**
 * Oyuncu/takım/lig/maç panelleri kök layout'ta render edildiği için sayfa
 * (route) değişse bile React state'te açık kalabiliyor — örneğin Ana
 * Sayfa'da bir takım kartı açıkken "Oyunlar" sekmesine geçildiğinde panel,
 * yeni sayfanın üzerinde açık kalıyordu. Bu hem kafa karıştırıcı hem de
 * panel açılırken eklenen "sanal" geçmiş girdisinin gerçek sayfa
 * geçişleriyle karışıp geri tuşunun beklenmedik davranmasına (örn.
 * Oyunlar'da geri tuşuna basınca doğrudan siteden çıkılması) yol
 * açabiliyordu. Bu yüzden her gerçek sayfa geçişinde (panel URL'lerine
 * geçişler HARİÇ) açık panelleri otomatik olarak kapatıyoruz.
 */
export function PanelRouteGuard() {
  const pathname = usePathname()
  const { panel: playerPanel, closePlayer } = usePlayerPanel()
  const { panel: teamPanel, closeTeam } = useTeamPanel()
  const { panel: leaguePanel, closeLeague } = useLeaguePanel()
  const { panel: matchPanel, closeMatch } = useMatchPanel()
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    if (PANEL_URL_PATTERN.test(pathname)) return
    if (playerPanel) closePlayer()
    if (teamPanel) closeTeam()
    if (leaguePanel) closeLeague()
    if (matchPanel) closeMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
