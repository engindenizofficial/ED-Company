"use client"

import { useCallback, useEffect, useState } from "react"
import { deletePushSubscription, hasActivePushSubscription, savePushSubscription } from "@/app/actions/push-subscriptions"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type PushNotificationStatus = "loading" | "unsupported" | "enabled" | "disabled"

/**
 * Favori takım bildirimleri için Web Push abonelik durumunu yönetir.
 * Service worker kaydı, Notification izni ve DB'deki abonelik satırının
 * senkronize kalmasından sorumludur.
 */
export function usePushNotifications(isSignedIn: boolean) {
  const [status, setStatus] = useState<PushNotificationStatus>("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported")
        return
      }
      if (!isSignedIn) {
        if (!cancelled) setStatus("disabled")
        return
      }
      try {
        const active = await hasActivePushSubscription()
        if (!cancelled) setStatus(active ? "enabled" : "disabled")
      } catch {
        if (!cancelled) setStatus("disabled")
      }
    }

    checkStatus()
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  const enable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!isSignedIn) {
        setError("requiresLogin")
        return
      }
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setError("notSupported")
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setError("permissionDenied")
        return
      }

      const registration = await navigator.serviceWorker.register("/sw-push.js")
      await navigator.serviceWorker.ready

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        setError("genericError")
        return
      }

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("genericError")
        return
      }

      await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })

      setStatus("enabled")
    } catch {
      setError("genericError")
    } finally {
      setBusy(false)
    }
  }, [busy, isSignedIn])

  const disable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/sw-push.js")
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          await deletePushSubscription(subscription.endpoint)
          await subscription.unsubscribe()
        }
      }
      setStatus("disabled")
    } catch {
      setError("genericError")
    } finally {
      setBusy(false)
    }
  }, [busy])

  return { status, busy, error, enable, disable }
}
