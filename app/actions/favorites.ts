"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { favorite } from "@/lib/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"

const nullableUrlSchema = z.string().url().max(2048).nullable()
const favoriteInputSchema = z.object({
  type: z.enum(["team", "league"]),
  itemId: z.number().int().positive().max(2_147_483_647),
  name: z.string().trim().min(1).max(160),
  logo: nullableUrlSchema,
  country: z.string().trim().min(1).max(100).nullable(),
  flagUrl: nullableUrlSchema,
}).strict()
const favoriteIdSchema = z.string().uuid()
const orderedIdsSchema = z.array(favoriteIdSchema).max(500)

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

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

async function listFavorites(userId: string): Promise<FavoriteItem[]> {
  const rows = await db.select().from(favorite).where(eq(favorite.userId, userId)).orderBy(asc(favorite.position))
  return rows.map((row) => ({
    id: row.id,
    type: row.type as "team" | "league",
    itemId: row.itemId,
    name: row.name,
    logo: row.logo,
    country: row.country,
    flagUrl: row.flagUrl,
    position: row.position,
  }))
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  return listFavorites(await getUserId())
}

export async function addFavorite(input: unknown): Promise<FavoriteItem[]> {
  const userId = await getUserId()
  const parsed = favoriteInputSchema.parse(input)

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: favorite.id })
      .from(favorite)
      .where(and(eq(favorite.userId, userId), eq(favorite.type, parsed.type), eq(favorite.itemId, parsed.itemId)))
      .limit(1)

    if (existing.length > 0) return

    const current = await tx
      .select({ position: favorite.position })
      .from(favorite)
      .where(eq(favorite.userId, userId))
      .orderBy(asc(favorite.position))

    await tx.insert(favorite).values({
      id: crypto.randomUUID(),
      userId,
      ...parsed,
      position: current.length > 0 ? current[current.length - 1].position + 1 : 0,
    })
  })

  revalidatePath("/")
  return listFavorites(userId)
}

export async function removeFavorite(id: unknown): Promise<FavoriteItem[]> {
  const userId = await getUserId()
  const parsedId = favoriteIdSchema.parse(id)
  await db.delete(favorite).where(and(eq(favorite.id, parsedId), eq(favorite.userId, userId)))
  revalidatePath("/")
  return listFavorites(userId)
}

export async function reorderFavorites(orderedIds: unknown): Promise<FavoriteItem[]> {
  const userId = await getUserId()
  const parsedIds = orderedIdsSchema.parse(orderedIds)
  if (new Set(parsedIds).size !== parsedIds.length) throw new Error("Duplicate favorite ids")

  await db.transaction(async (tx) => {
    const ownedRows = parsedIds.length === 0
      ? []
      : await tx
          .select({ id: favorite.id })
          .from(favorite)
          .where(and(eq(favorite.userId, userId), inArray(favorite.id, parsedIds)))

    if (ownedRows.length !== parsedIds.length) throw new Error("Invalid favorite order")

    for (const [position, id] of parsedIds.entries()) {
      await tx
        .update(favorite)
        .set({ position })
        .where(and(eq(favorite.id, id), eq(favorite.userId, userId)))
    }
  })

  revalidatePath("/")
  return listFavorites(userId)
}
