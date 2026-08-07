import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.V0_RUNTIME_URL) as string

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string }, url: string }) => {
      await resend.emails.send({
        from: 'ED Analytics <onboarding@resend.dev>',
        to: user.email,
        subject: 'E-posta adresinizi doğrulayın',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:12px;">
            <h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">ED Analytics</h2>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">Merhaba ${user.name ?? user.email},</p>
            <p style="color:#cbd5e1;font-size:14px;margin-bottom:24px;">Hesabınızı doğrulamak için aşağıdaki butona tıklayın. Bu link 24 saat geçerlidir.</p>
            <a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">E-postamı Doğrula</a>
            <p style="color:#475569;font-size:12px;margin-top:24px;">Bu e-postayı siz talep etmediyseniz dikkate almayın.</p>
          </div>
        `,
      })
    },
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
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
