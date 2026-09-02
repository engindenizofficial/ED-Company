"use client"

import { useCallback, useEffect, useState } from "react"
import {
  deletePushSubscription,
  hasActivePushSubscription,
  savePushSubscription,
  sendTestPushNotification,
} from "@/app/actions/push-subscriptions"
import { useAccountPreferences } from "@/hooks/use-account-preferences"

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
  const { preferences, update: updatePreferences } = useAccountPreferences()

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
        const registration = await navigator.serviceWorker.getRegistration("/sw-push.js")
        const subscription = await registration?.pushManager.getSubscription()
        if (!subscription) {
          if (!cancelled) setStatus("disabled")
          return
        }
        const active = await hasActivePushSubscription(subscription.endpoint)
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

      // VAPID anahtarları sunucu tarafında değiştirilmiş olabilir (örn. ilk
      // kurulumda eksikti ve sonradan eklendi). Tarayıcıdaki abonelik farklı
      // bir public key ile oluşturulmuşsa, sunucunun elindeki private key ile
      // artık eşleşmez ve push gönderimi sessizce 403 ile başarısız olur.
      // Bu durumda eski aboneliği iptal edip güncel anahtarla yeniden abone
      // oluyoruz.
      if (subscription) {
        const currentKey = subscription.options?.applicationServerKey
          ? btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey as ArrayBuffer)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "")
          : null
        const expectedKey = publicKey.replace(/=+$/, "")
        if (currentKey && currentKey !== expectedKey) {
          await subscription.unsubscribe()
          subscription = null
        }
      }

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
      await updatePreferences({ notificationsEnabled: true })

      setStatus("enabled")
    } catch {
      setError("genericError")
    } finally {
      setBusy(false)
    }
  }, [busy, isSignedIn, updatePreferences])

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
      if (isSignedIn) await updatePreferences({ notificationsEnabled: false })
      setStatus("disabled")
    } catch {
      setError("genericError")
    } finally {
      setBusy(false)
    }
  }, [busy, isSignedIn, updatePreferences])

  useEffect(() => {
    if (preferences?.exists && !preferences.notificationsEnabled && status === "enabled" && !busy) {
      void disable()
    }
  }, [busy, disable, preferences, status])

  const sendTest = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await sendTestPushNotification()
    } catch {
      setError("genericError")
    } finally {
      setBusy(false)
    }
  }, [busy])

  return {
    status,
    busy,
    error,
    enable,
    disable,
    sendTest,
    accountEnabled: preferences?.notificationsEnabled ?? status === "enabled",
  }
}
