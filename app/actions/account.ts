"use server"

import { auth, baseURL } from "@/lib/auth"
import { db } from "@/lib/db"
import { verification } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { Resend } from "resend"
import type { Locale } from "@/lib/i18n/dictionaries"
import { getAccountDeletionEmail } from "@/lib/i18n/email-templates"

const resend = new Resend(process.env.RESEND_API_KEY)

/** Silme linkinin geçerlilik süresi. */
const DELETE_TOKEN_TTL_MS = 1000 * 60 * 60 // 1 saat

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

/**
 * Kullanıcının hesap silme talebini başlatır: e-postasına, tıklandığında
 * hesabı kalıcı olarak silecek tek kullanımlık bir link gönderir.
 * Link, tarayıcıda çıplak URL olarak görünmez — doğrulama e-postasındaki
 * gibi stilize bir buton olarak gösterilir.
 */
export async function requestAccountDeletion(locale: Locale = "tr"): Promise<{ email: string }> {
  const user = await getSessionUser()
  const identifier = `delete-account:${user.id}`

  // Kullanıcının önceki bekleyen silme taleplerini geçersiz kıl —
  // aynı anda yalnızca bir silme linki geçerli olsun.
  await db.delete(verification).where(eq(verification.identifier, identifier))

  const token = crypto.randomUUID()

  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: token,
    expiresAt: new Date(Date.now() + DELETE_TOKEN_TTL_MS),
  })

  const url = `${baseURL}/api/account/delete?token=${token}`

  const { subject, html } = getAccountDeletionEmail(locale, user.name ?? user.email, url)

  await resend.emails.send({
    from: "ED Analytics <no-reply@edcompanyofficial.com>",
    to: user.email,
    subject,
    html: html.replace("{{LOGO_URL}}", `${baseURL}/icon-512.png`),
  })

  return { email: user.email }
}
