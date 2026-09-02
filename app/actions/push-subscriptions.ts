"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { pushSubscription } from "@/lib/db/schema"
import { sendPushToUsers } from "@/lib/push-notifications"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

const endpointSchema = z.string().url().max(4096).refine((value) => value.startsWith("https://"), "Push endpoint must use HTTPS")
const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(32).max(512),
    auth: z.string().min(16).max(256),
  }).strict(),
}).strict()

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export async function savePushSubscription(input: unknown): Promise<void> {
  const userId = await getUserId()
  const parsed = pushSubscriptionSchema.parse(input)

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: pushSubscription.id })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, parsed.endpoint))
      .limit(1)

    if (existing.length > 0) {
      await tx
        .update(pushSubscription)
        .set({ userId, p256dh: parsed.keys.p256dh, auth: parsed.keys.auth })
        .where(eq(pushSubscription.endpoint, parsed.endpoint))
      return
    }

    await tx.insert(pushSubscription).values({
      id: crypto.randomUUID(),
      userId,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
    })
  })
}

export async function deletePushSubscription(endpoint: unknown): Promise<void> {
  const userId = await getUserId()
  const parsedEndpoint = endpointSchema.parse(endpoint)
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, parsedEndpoint), eq(pushSubscription.userId, userId)))
}

export async function hasActivePushSubscription(endpoint: unknown): Promise<boolean> {
  const userId = await getUserId()
  const parsedEndpoint = endpointSchema.parse(endpoint)
  const rows = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, parsedEndpoint)))
    .limit(1)
  return rows.length > 0
}

export async function sendTestPushNotification(): Promise<void> {
  const userId = await getUserId()
  await sendPushToUsers([userId], {
    title: "Test bildirimi",
    body: "Push bildirimleri çalışıyor. Gerçek maçlarda gol, başlangıç ve bitiş anlarında bildirim alacaksın.",
    tag: "test-notification",
  })
}
