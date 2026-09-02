import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { pool } from '@/lib/db'
import { Resend } from 'resend'
import { getSiteUrl, sanitize } from '@/lib/site-url'

const resend = new Resend(process.env.RESEND_API_KEY)

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

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 3600, // 1 saat
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string }, url: string }) => {
      const { error } = await resend.emails.send({
        from: 'ED Analytics <no-reply@edcompanyofficial.com>',
        to: user.email,
        subject: 'Şifrenizi sıfırlayın',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
            <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
            <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Merhaba ${user.name ?? user.email},</p>
            <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">Şifreni sıfırlamak için aşağıdaki butona tıkla. Bu link 1 saat geçerlidir.</p>
            <a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Şifremi Sıfırla</a>
            <p style="color:#475569;font-size:12px;margin-top:24px;">Bu talebi siz oluşturmadıysanız bu e-postayı dikkate almayın; şifreniz değişmeyecektir.</p>
          </div>
        `,
      }, { idempotencyKey: emailIdempotencyKey('password-reset', url) })
      if (error) throw new Error(`Password reset email failed: ${error.message}`)
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string }, url: string }) => {
      const { error } = await resend.emails.send({
        from: 'ED Analytics <no-reply@edcompanyofficial.com>',
        to: user.email,
        subject: 'E-posta adresinizi doğrulayın',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
            <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
            <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Merhaba ${user.name ?? user.email},</p>
            <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">Hesabınızı doğrulamak için aşağıdaki butona tıklayın. Bu link 24 saat geçerlidir.</p>
            <a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">E-postamı Doğrula</a>
            <p style="color:#475569;font-size:12px;margin-top:24px;">Bu e-postayı siz talep etmediyseniz dikkate almayın.</p>
          </div>
        `,
      }, { idempotencyKey: emailIdempotencyKey('email-verification', url) })
      if (error) throw new Error(`Verification email failed: ${error.message}`)
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300, // 5 dakika
      sendVerificationOTP: async ({ email, otp }: { email: string; otp: string }) => {
        const { error } = await resend.emails.send({
          from: 'ED Analytics <no-reply@edcompanyofficial.com>',
          to: email,
          subject: 'Giriş doğrulama kodunuz',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
              <img src="${baseURL}/icon-512.png" alt="ED Analytics" width="40" height="40" style="border-radius:8px;margin-bottom:16px;display:block;" />
              <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
              <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Giriş doğrulama kodunuz:</p>
              <div style="background:#1e293b;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
                <span style="color:#f8fafc;font-size:36px;font-weight:700;letter-spacing:12px;">${otp}</span>
              </div>
              <p style="color:#cbd5e1;font-size:13px;margin-bottom:8px;">Bu kod <strong>5 dakika</strong> geçerlidir.</p>
              <p style="color:#475569;font-size:12px;">Bu işlemi siz başlatmadıysanız dikkate almayın.</p>
            </div>
          `,
        }, { idempotencyKey: emailIdempotencyKey('login-otp', `${email}:${otp}`) })
        if (error) throw new Error(`Login OTP email failed: ${error.message}`)
      },
    }),
  ],
  trustedOrigins: [
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
          ...(sanitize(process.env.VERCEL_URL) ? [`https://${sanitize(process.env.VERCEL_URL)}`] : []),
          ...(sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL)
            ? [`https://${sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`]
            : []),
        ]),
  ],
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
