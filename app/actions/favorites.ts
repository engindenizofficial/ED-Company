"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { favorite } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

export interface FavoriteItem {
  id: string
  type: "team" | "league"
  itemId: number
  name: string
  logo: string | null
  country: string | null
  flagUrl: string | null
  position: number
}

/**
 * Her kullanıcı verisine dokunan action bu helper'dan geçmek ZORUNDA —
 * bir kullanıcının satırlarını diğerinden ayıran tek şey bu.
 */
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(favorite)
    .where(eq(favorite.userId, userId))
    .orderBy(asc(favorite.position))

  return rows.map((r) => ({
    id: r.id,
    type: r.type as "team" | "league",
    itemId: r.itemId,
    name: r.name,
    logo: r.logo,
    country: r.country,
    flagUrl: r.flagUrl,
    position: r.position,
  }))
}

export async function addFavorite(input: {
  type: "team" | "league"
  itemId: number
  name: string
  logo: string | null
  country: string | null
  flagUrl: string | null
}): Promise<FavoriteItem[]> {
  const userId = await getUserId()

  const existing = await db
    .select({ id: favorite.id })
    .from(favorite)
    .where(and(eq(favorite.userId, userId), eq(favorite.type, input.type), eq(favorite.itemId, input.itemId)))

  if (existing.length === 0) {
    const current = await db
      .select({ position: favorite.position })
      .from(favorite)
      .where(eq(favorite.userId, userId))
      .orderBy(asc(favorite.position))

    const nextPosition = current.length > 0 ? current[current.length - 1].position + 1 : 0

    await db.insert(favorite).values({
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      itemId: input.itemId,
      name: input.name,
      logo: input.logo,
      country: input.country,
      flagUrl: input.flagUrl,
      position: nextPosition,
    })
  }

  revalidatePath("/")
  return getFavorites()
}

export async function removeFavorite(id: string): Promise<FavoriteItem[]> {
  const userId = await getUserId()
  await db.delete(favorite).where(and(eq(favorite.id, id), eq(favorite.userId, userId)))
  revalidatePath("/")
  return getFavorites()
}

/** Yeni sıralamayı (favori id'lerin sırası) kalıcı hale getirir. */
export async function reorderFavorites(orderedIds: string[]): Promise<FavoriteItem[]> {
  const userId = await getUserId()

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(favorite)
        .set({ position: index })
        .where(and(eq(favorite.id, id), eq(favorite.userId, userId))),
    ),
  )

  revalidatePath("/")
  return getFavorites()
}
