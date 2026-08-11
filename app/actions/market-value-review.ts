"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { isAdminEmail } from "@/lib/admin"
import { db } from "@/lib/db"
import { marketValueReviewQueue, teamMarketValue, playerMarketValue } from "@/lib/db/schema"

// ---------------------------------------------------------------------------
// Manuel gözden geçirme arayüzünün (8. adım) yazma katmanı. Sadece admin
// e-postası ile giriş yapmış kullanıcı çağırabilir. Onay/red, review kuyruğu
// kaydını çözer VE ilgili team_market_value / player_market_value satırını
// buna göre günceller — cron'un tekrar üzerine yazmaması için status artık
// "pending" olmadığından upsertReviewQueueEntry bu kayda dokunmaz.
// ---------------------------------------------------------------------------

const REVIEW_PATH = "/admin/market-value-review"

async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!isAdminEmail(session?.user?.email)) {
    throw new Error("Unauthorized")
  }
}

interface ReviewRow {
  id: string
  entityType: "team" | "player"
  entityId: number
  candidateTransfermarktId: string | null
  candidateValueEur: string | null
  confidence: number
  status: string
}

async function getReviewRow(id: string): Promise<ReviewRow | null> {
  const rows = await db
    .select()
    .from(marketValueReviewQueue)
    .where(eq(marketValueReviewQueue.id, id))
    .limit(1)
  if (rows.length === 0) return null
  return rows[0] as ReviewRow
}

/**
 * Bir review kaydını onaylar: adayı doğru kabul eder, ilgili takım/oyuncu
 * satırını "matched" durumuna, adayın piyasa değeri ve Transfermarkt id'siyle
 * günceller.
 */
export async function approveReviewEntry(id: string): Promise<void> {
  await requireAdmin()

  const row = await getReviewRow(id)
  if (!row || row.status !== "pending") return

  const now = new Date()

  await db
    .update(marketValueReviewQueue)
    .set({ status: "approved", resolvedAt: now })
    .where(eq(marketValueReviewQueue.id, id))

  if (row.entityType === "team") {
    await db
      .update(teamMarketValue)
      .set({
        transfermarktTeamId: row.candidateTransfermarktId,
        totalValueEur: row.candidateValueEur,
        matchConfidence: row.confidence,
        matchStatus: "matched",
        updatedAt: now,
      })
      .where(eq(teamMarketValue.teamId, row.entityId))
  } else {
    await db
      .update(playerMarketValue)
      .set({
        transfermarktPlayerId: row.candidateTransfermarktId,
        valueEur: row.candidateValueEur,
        matchConfidence: row.confidence,
        matchStatus: "matched",
        updatedAt: now,
      })
      .where(eq(playerMarketValue.playerId, row.entityId))
  }

  revalidatePath(REVIEW_PATH)
}

/**
 * Bir review kaydını reddeder: adayın yanlış olduğunu işaretler, ilgili
 * takım/oyuncu satırını "unmatched" durumuna çeker (yanlış veri göstermek
 * yerine boş bırakır).
 */
export async function rejectReviewEntry(id: string): Promise<void> {
  await requireAdmin()

  const row = await getReviewRow(id)
  if (!row || row.status !== "pending") return

  const now = new Date()

  await db
    .update(marketValueReviewQueue)
    .set({ status: "rejected", resolvedAt: now })
    .where(eq(marketValueReviewQueue.id, id))

  if (row.entityType === "team") {
    await db
      .update(teamMarketValue)
      .set({
        transfermarktTeamId: null,
        totalValueEur: null,
        matchConfidence: null,
        matchStatus: "unmatched",
        updatedAt: now,
      })
      .where(eq(teamMarketValue.teamId, row.entityId))
  } else {
    await db
      .update(playerMarketValue)
      .set({
        transfermarktPlayerId: null,
        valueEur: null,
        matchConfidence: null,
        matchStatus: "unmatched",
        updatedAt: now,
      })
      .where(eq(playerMarketValue.playerId, row.entityId))
  }

  revalidatePath(REVIEW_PATH)
}
