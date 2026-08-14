"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useLeaguePanel } from "@/contexts/league-context"

interface LeagueUrlOpenerProps {
  id: number
  name: string
  logo: string
  country: string
  flagUrl: string | null
}

/**
 * /lig/[id] sayfası, doğrudan ziyaret / yenileme / paylaşılan link için
 * var olan "gerçek" bir route — kendi görsel içeriği yok, sadece mevcut
 * global lig panelini (LeaguePanel, kök layout'ta render edilir) açar.
 * Bkz. components/player-url-opener.tsx — aynı kalıp.
 */
export function LeagueUrlOpener({ id, name, logo, country, flagUrl }: LeagueUrlOpenerProps) {
  const router = useRouter()
  const { panel, openLeague } = useLeaguePanel()
  // Bkz. player-url-opener.tsx — aynı düzeltme: bu ref sadece panel state'ini
  // gözleyen effect'te true'ya çekilir, "biz açtık" branch'inde değil (o
  // branch openLeague()'in async fetch'i bitmeden çalışır).
  const hasOpenedRef = useRef(false)

  useEffect(() => {
    if (panel?.league.id !== id) {
      openLeague({ id, name, logo, country, flagUrl })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (panel?.league.id === id) {
      hasOpenedRef.current = true
      return
    }
    if (hasOpenedRef.current) {
      router.replace("/")
    }
  }, [panel, id, router])

  return null
}
