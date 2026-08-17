"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { pushSubscription } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"

/**
 * Her kullanıcı verisine dokunan action bu helper'dan geçmek ZORUNDA —
 * bir kullanıcının satırlarını diğerinden ayıran tek şey bu.
 */
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/** Tarayıcıdan gelen push aboneliğini kaydeder (aynı endpoint tekrar gelirse günceller). */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  const userId = await getUserId()

  const existing = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, input.endpoint))

  if (existing.length > 0) {
    await db
      .update(pushSubscription)
      .set({ userId, p256dh: input.keys.p256dh, auth: input.keys.auth })
      .where(eq(pushSubscription.endpoint, input.endpoint))
    return
  }

  await db.insert(pushSubscription).values({
    id: crypto.randomUUID(),
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  })
}

/** Kullanıcı bildirimleri kapattığında ilgili endpoint'i siler. */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const userId = await getUserId()
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)))
}

/** Bu kullanıcının en az bir aktif push aboneliği var mı? (ayarlar ekranında toggle durumu için) */
export async function hasActivePushSubscription(): Promise<boolean> {
  const userId = await getUserId()
  const rows = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .limit(1)
  return rows.length > 0
}
