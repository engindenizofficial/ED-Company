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
// Not: maç paneli artık (diğer üç panel gibi) kök layout'ta global bir
// context'te (MatchContext) yaşıyor — bu yüzden aynı kapatma mantığı ona da
// uygulanır.
const PANEL_URL_PATTERN = /^\/(oyuncu|takim|lig|mac)\/\d+$/

/**
 * Oyuncu/takım/lig panelleri kök layout'ta render edildiği için sayfa
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
  const { panel: playerPanel, closeAllPlayer } = usePlayerPanel()
  const { panel: teamPanel, closeAllTeam } = useTeamPanel()
  const { panel: leaguePanel, closeAllLeague } = useLeaguePanel()
  const { panel: matchPanel, closeAllMatch } = useMatchPanel()
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    if (PANEL_URL_PATTERN.test(pathname)) return
    // `closeAllX` kullanılır — bir panel türü içinden aynı türde başka bir
    // örnek açılmış olabilir (örn. takım A'dan takım B'ye geçilmiş), gerçek
    // bir sayfa geçişinde bunların TÜMÜNÜN kapanması gerekir; `closeX` sadece
    // en üstteki seviyeyi kapatır.
    if (playerPanel) closeAllPlayer()
    if (teamPanel) closeAllTeam()
    if (leaguePanel) closeAllLeague()
    if (matchPanel) closeAllMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
