"use server"

import { auth, baseURL } from "@/lib/auth"
import { db } from "@/lib/db"
import { verification } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { Resend } from "resend"

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
export async function requestAccountDeletion(): Promise<{ email: string }> {
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

  await resend.emails.send({
    from: "ED Analytics <no-reply@edcompanyofficial.com>",
    to: user.email,
    subject: "Hesap silme talebiniz",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
        <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
        <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">Hesap Silme Talebi</h2>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:20px;">Merhaba ${user.name ?? user.email},</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:8px;">Hesabınızı kalıcı olarak silme talebinde bulundunuz.</p>
        <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">
          Aşağıdaki butona tıkladığınızda hesabınız; profil bilgileriniz, favori takım/liglerinizi ve tüm tahmin
          geçmişinizle birlikte <strong>anında ve kalıcı olarak silinir</strong>. Bu işlem geri alınamaz. Bu link
          <strong>1 saat</strong> geçerlidir.
        </p>
        <a href="${url}" style="display:inline-block;background:#ef4444;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Hesabımı Kalıcı Olarak Sil</a>
        <p style="color:#475569;font-size:12px;margin-top:24px;">Bu talebi siz oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz, hesabınızda herhangi bir değişiklik yapılmaz.</p>
      </div>
    `,
  })

  return { email: user.email }
}
