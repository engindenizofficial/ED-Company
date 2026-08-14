"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTeamPanel } from "@/contexts/team-context"

interface TeamUrlOpenerProps {
  id: number
  name: string
  logo: string
}

/**
 * /takim/[id] sayfası, doğrudan ziyaret / yenileme / paylaşılan link için
 * var olan "gerçek" bir route — kendi görsel içeriği yok, sadece mevcut
 * global takım panelini (TeamPanel, kök layout'ta render edilir) açar.
 * Bkz. components/player-url-opener.tsx — aynı kalıp.
 */
export function TeamUrlOpener({ id, name, logo }: TeamUrlOpenerProps) {
  const router = useRouter()
  const { panel, openTeam } = useTeamPanel()
  // Bkz. player-url-opener.tsx — aynı düzeltme: bu ref sadece panel state'ini
  // gözleyen effect'te true'ya çekilir, "biz açtık" branch'inde değil (o
  // branch openTeam()'in async fetch'i bitmeden çalışır).
  const hasOpenedRef = useRef(false)

  useEffect(() => {
    if (panel?.team.id !== id) {
      openTeam({ id, name, logo })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (panel?.team.id === id) {
      hasOpenedRef.current = true
      return
    }
    if (hasOpenedRef.current) {
      router.replace("/")
    }
  }, [panel, id, router])

  return null
}
