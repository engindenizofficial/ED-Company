import webpush from "web-push"
import { db } from "@/lib/db"
import { pushSubscription } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Web Push gönderim motoru. Canlı maç cron'u (lib/live-fixture-notify.ts) ve
// ileride eklenebilecek başka tetikleyiciler BUNUN üzerinden bildirim yollar
// — VAPID kurulumu ve "gone" abonelik temizliği tek yerde toplanır.
// ---------------------------------------------------------------------------

let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY tanımlı değil — push bildirimi gönderilemez.")
  }
  webpush.setVapidDetails("mailto:destek@edanalytics.app", publicKey, privateKey)
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  /** Bildirime tıklanınca açılacak/odaklanılacak yol, örn. "/?fixture=123" */
  url?: string
  /** Aynı maçın art arda bildirimlerini gruplamak/değiştirmek için (örn. "fixture-123") */
  tag?: string
}

/**
 * Verilen kullanıcı id'lerine ait TÜM cihaz aboneliklerine paralel olarak
 * push gönderir. 404/410 (Not Found / Gone) dönen abonelikler artık geçersiz
 * sayılıp DB'den otomatik silinir.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return
  ensureVapidConfigured()

  const subscriptions = await db
    .select()
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, [...new Set(userIds)]))

  if (subscriptions.length === 0) return

  const body = JSON.stringify(payload)
  const staleEndpoints: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error(`[v0] Push gönderim hatası (endpoint: ${sub.endpoint.slice(0, 50)}...):`, err)
        }
      }
    }),
  )

  if (staleEndpoints.length > 0) {
    await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, staleEndpoints))
    console.log(`[v0] ${staleEndpoints.length} geçersiz (gone/not-found) push aboneliği silindi.`)
  }
}
