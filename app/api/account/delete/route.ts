import { db } from "@/lib/db"
import { favorite, user, verification } from "@/lib/db/schema"
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

  const rows = await db.select().from(verification).where(eq(verification.value, token))
  const row = rows[0]

  if (!row || !row.identifier.startsWith("delete-account:")) {
    return NextResponse.redirect(`${origin}/delete-account?status=invalid`)
  }

  // Tek kullanımlık: bulunduğu anda tüket, süresi dolmuş olsa da geçersizleştir.
  await db.delete(verification).where(eq(verification.id, row.id))

  if (row.expiresAt < new Date()) {
    return NextResponse.redirect(`${origin}/delete-account?status=invalid`)
  }

  const userId = row.identifier.slice("delete-account:".length)

  await db.delete(favorite).where(eq(favorite.userId, userId))
  await db.delete(user).where(eq(user.id, userId))

  return NextResponse.redirect(`${origin}/delete-account?status=success`)
}
