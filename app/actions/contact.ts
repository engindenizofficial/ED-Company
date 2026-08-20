"use server"

import { Resend } from "resend"
import { z } from "zod"

const resend = new Resend(process.env.RESEND_API_KEY)

const CONTACT_RECIPIENT = "support@edcompanyofficial.com"

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(4000),
})

export interface ContactFormResult {
  success: boolean
}

/**
 * İletişim formundan gelen mesajı destek e-postasına iletir. Girdiler
 * `contactSchema` ile sunucu tarafında doğrulanır (uzunluk/format) — bu,
 * hem spam/kötüye kullanımı sınırlar hem de e-posta gövdesine ham kullanıcı
 * girdisi HTML olarak enjekte edilmeden önce en azından temel şekil
 * kontrolünden geçmesini garanti eder.
 */
export async function sendContactMessage(input: {
  name: string
  email: string
  message: string
}): Promise<ContactFormResult> {
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false }
  }
  const { name, email, message } = parsed.data

  // Basit HTML kaçışı — kullanıcı girdisi e-posta HTML gövdesine
  // yerleştirilmeden önce özel karakterler encode edilir.
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

  try {
    await resend.emails.send({
      from: "ED Company İletişim Formu <no-reply@edcompanyofficial.com>",
      to: CONTACT_RECIPIENT,
      replyTo: email,
      subject: `İletişim formu: ${name}`,
      html: `
        <div style="font-family: sans-serif; font-size: 14px; color: #111;">
          <p><strong>Ad Soyad:</strong> ${escapeHtml(name)}</p>
          <p><strong>E-posta:</strong> ${escapeHtml(email)}</p>
          <p><strong>Mesaj:</strong></p>
          <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>
      `,
    })
    return { success: true }
  } catch (err) {
    console.log("[v0] sendContactMessage failed:", err instanceof Error ? err.message : err)
    return { success: false }
  }
}
