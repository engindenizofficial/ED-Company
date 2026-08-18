"use client"

import { useEffect } from "react"
import { playGoalSound } from "@/lib/goal-sound"

/**
 * Uygulama açıkken (sekme/PWA ön planda) push service worker'dan gelen
 * "PLAY_GOAL_SOUND" mesajını dinler ve özel gol sesi efektini çalar.
 * Arka plandaki bildirimler için tarayıcının varsayılan sesi zaten devrede;
 * bu sadece uygulama açıkken duyulan ekstra sestir.
 */
export function PushSoundListener() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "PLAY_GOAL_SOUND") {
        playGoalSound()
      }
    }

    navigator.serviceWorker.addEventListener("message", handleMessage)
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage)
  }, [])

  return null
}
