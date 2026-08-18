"use client"

import { usePwaUpdate } from "@/hooks/use-pwa-update"

/**
 * Görsel bir çıktısı yok; sadece `usePwaUpdate` hook'unu bağlar. Bkz.
 * hooks/use-pwa-update.ts için ayrıntılı açıklama.
 */
export function PwaUpdateWatcher() {
  usePwaUpdate()
  return null
}
