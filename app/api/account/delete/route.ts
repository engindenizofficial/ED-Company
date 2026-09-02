import { db } from "@/lib/db"
import {
  favorite,
  marketValueDuelDailyResult,
  marketValueDuelStats,
  pushSubscription,
  user,
  userPreferences,
  verification,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

/**
 * Hesap silme e-postasındaki linke tıklandığında çalışır. Token geçerliyse
 * kullanıcının tüm verilerini ve hesabını kalıcı olarak siler.
 * `session` ve `account` tabloları `user.id` üzerinden `onDelete: cascade`
 * ile tanımlı olduğu için kullanıcı silindiğinde otomatik temizlenir.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  const origin = request.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(`${origin}/delete-account?status=invalid`)
  }

  // DELETE ... RETURNING aynı tokenın eşzamanlı iki istekte kullanılmasını engeller.
  const rows = await db.delete(verification).where(eq(verification.value, token)).returning()
  const row = rows[0]

  if (!row || !row.identifier.startsWith("delete-account:") || row.expiresAt < new Date()) {
    return NextResponse.redirect(`${origin}/delete-account?status=invalid`)
  }

  const userId = row.identifier.slice("delete-account:".length)

  await db.transaction(async (tx) => {
    await tx.delete(pushSubscription).where(eq(pushSubscription.userId, userId))
    await tx.delete(userPreferences).where(eq(userPreferences.userId, userId))
    await tx.delete(marketValueDuelDailyResult).where(eq(marketValueDuelDailyResult.userId, userId))
    await tx.delete(marketValueDuelStats).where(eq(marketValueDuelStats.userId, userId))
    await tx.delete(favorite).where(eq(favorite.userId, userId))
    // manager_career ile Better Auth session/account kayıtları foreign key
    // cascade üzerinden bu kullanıcıyla birlikte temizlenir.
    await tx.delete(user).where(eq(user.id, userId))
  })

  return NextResponse.redirect(`${origin}/delete-account?status=success`)
}
