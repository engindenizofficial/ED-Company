import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { Resend } from 'resend'
import { getSiteUrl, PRODUCTION_SITE_URL, sanitize } from '@/lib/site-url'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

function emailIdempotencyKey(prefix: string, value: string) {
  const digest = createHash('sha256').update(value).digest('hex')
  return `${prefix}/${digest}`
}

// getSiteUrl() zaten BETTER_AUTH_URL -> VERCEL_PROJECT_PRODUCTION_URL ->
// VERCEL_URL -> V0_RUNTIME_URL sırasını deniyor, sonucu new URL() ile
// doğruluyor (platform env değişkenlerine bazen sarılan literal tırnakları
// da temizliyor) ve hepsi boşsa/geçersizse localhost'a düşüyor — bu yüzden
// burada ayrıca boşluk kontrolüne gerek yok.
export const baseURL = getSiteUrl()

const trustedOrigins = [
  ...(process.env.NODE_ENV === 'development'
    ? [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        ...(sanitize(process.env.V0_RUNTIME_URL) ? [sanitize(process.env.V0_RUNTIME_URL) as string] : []),
        ...(sanitize(process.env.V0_DEV_APP_URL) ? [sanitize(process.env.V0_DEV_APP_URL) as string] : []),
        ...(sanitize(process.env.V0_BUILD_URL) ? [sanitize(process.env.V0_BUILD_URL) as string] : []),
        ...(sanitize(process.env.V0_SANDBOX_URL) ? [sanitize(process.env.V0_SANDBOX_URL) as string] : []),
      ]
    : [
        PRODUCTION_SITE_URL,
        'https://www.edcompanyofficial.com',
        ...(sanitize(process.env.VERCEL_URL) ? [`https://${sanitize(process.env.VERCEL_URL)}`] : []),
        ...(sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL)
          ? [`https://${sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`]
          : []),
      ]),
]

const allowedAuthOrigins = new Set(
  [baseURL, ...trustedOrigins].flatMap((value) => {
    try {
      return [new URL(value).origin]
    } catch {
      return []
    }
  }),
)

/**
 * Better Auth, e-posta aksiyonunun ara bağlantısını global baseURL ile üretir.
 * Preview ve production farklı DATABASE_URL kullanıyorsa bu bağlantı tokenı
 * başka veritabanında doğrulamaya çalışabilir. Callback URL origin'i Better
 * Auth origin middleware'i tarafından doğrulanmış olsa da burada ayrıca izin
 * listesine bakıp ara bağlantıyı tokenın oluşturulduğu hostta tutuyoruz.
 */
function alignAuthActionUrl(actionUrl: string): string {
  try {
    const parsedActionUrl = new URL(actionUrl)
    const callbackURL = parsedActionUrl.searchParams.get('callbackURL')
    if (!callbackURL) return actionUrl

    const callbackOrigin = new URL(callbackURL).origin
    if (!allowedAuthOrigins.has(callbackOrigin)) return actionUrl

    const callback = new URL(callbackOrigin)
    parsedActionUrl.protocol = callback.protocol
    parsedActionUrl.host = callback.host
    return parsedActionUrl.toString()
  } catch {
    return actionUrl
  }
}

export const auth = betterAuth({
  database: pool,
  baseURL,
  onAPIError: {
    onError(error, context) {
      console.error('[v0] Better Auth API error', {
        path: context?.path,
        error,
      })
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 3600, // 1 saat
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string }, url: string }) => {
      const deliveryUrl = alignAuthActionUrl(url)
      const { error } = await getResend().emails.send({
        from: 'ED Analytics <no-reply@edcompanyofficial.com>',
        to: user.email,
        subject: 'Şifrenizi sıfırlayın',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
            <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
            <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Merhaba ${user.name ?? user.email},</p>
            <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">Şifreni sıfırlamak için aşağıdaki butona tıkla. Bu link 1 saat geçerlidir.</p>
            <a href="${deliveryUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Şifremi Sıfırla</a>
            <p style="color:#475569;font-size:12px;margin-top:24px;">Bu talebi siz oluşturmadıysanız bu e-postayı dikkate almayın; şifreniz değişmeyecektir.</p>
          </div>
        `,
      }, { idempotencyKey: emailIdempotencyKey('password-reset', deliveryUrl) })
      if (error) {
        console.error('[auth] Password reset email delivery failed', {
          errorName: error.name,
        })
      }
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string }, url: string }) => {
      const deliveryUrl = alignAuthActionUrl(url)
      const { error } = await getResend().emails.send({
        from: 'ED Analytics <no-reply@edcompanyofficial.com>',
        to: user.email,
        subject: 'E-posta adresinizi doğrulayın',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
            <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
            <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Merhaba ${user.name ?? user.email},</p>
            <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">Hesabınızı doğrulamak için aşağıdaki butona tıklayın. Bu link 24 saat geçerlidir.</p>
            <a href="${deliveryUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">E-postamı Doğrula</a>
            <p style="color:#475569;font-size:12px;margin-top:24px;">Bu e-postayı siz talep etmediyseniz dikkate almayın.</p>
          </div>
        `,
      }, { idempotencyKey: emailIdempotencyKey('email-verification', deliveryUrl) })
      if (error) {
        console.error('[auth] Verification email delivery failed', {
          errorName: error.name,
        })
      }
    },
  },
  trustedOrigins,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
