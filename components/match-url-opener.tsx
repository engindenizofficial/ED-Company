"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useMatchPanel } from "@/contexts/match-context"
import type { Fixture } from "@/lib/types"

interface MatchUrlOpenerProps {
  id: number
  /**
   * /mac/[id] sayfasının sunucu tarafında (generateMetadata ile aynı anda)
   * zaten çekmiş olduğu maç verisi. Doluysa panel, ayrıca bir client-side
   * fetch'i beklemeden ilk render'da anında açılır.
   */
  fixture?: Fixture
}

/**
 * /mac/[id] sayfası, doğrudan ziyaret / yenileme / paylaşılan link için
 * var olan "gerçek" bir route — kendi görsel içeriği yok, sadece mevcut
 * global maç panelini (MatchPanel, kök layout'ta render edilir) açar.
 * Bkz. components/team-url-opener.tsx — aynı kalıp.
 */
export function MatchUrlOpener({ id, fixture }: MatchUrlOpenerProps) {
  const router = useRouter()
  const { panel, openMatch } = useMatchPanel()
  const hasOpenedRef = useRef(false)
  const openedIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (openedIdRef.current === id) return
    openedIdRef.current = id
    openMatch(fixture ?? { id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (panel?.fixture.id === id) {
      hasOpenedRef.current = true
      return
    }
    if (hasOpenedRef.current) {
      router.replace("/")
    }
  }, [panel, id, router])

  return null
}
