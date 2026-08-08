import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { pool } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.V0_RUNTIME_URL) as string

if (!baseURL) {
  // Bu durumda Google OAuth ve e-posta linkleri bozuk URL üretir.
  // En sık sebep: Vercel projesinde "Enable access to System Environment
  // Variables" ayarının kapalı olması (Settings > Environment Variables).
  console.error(
    '[auth] baseURL çözümlenemedi: BETTER_AUTH_URL, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL ve V0_RUNTIME_URL değişkenlerinin hepsi boş. ' +
      'Vercel projesinde "Enable access to System Environment Variables" ayarını ve domain\'in Production olarak işaretli olduğunu kontrol edin.',
  )
}

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
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
      await resend.emails.send({
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
      })
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300, // 5 dakika
      sendVerificationOTP: async ({ email, otp }: { email: string; otp: string }) => {
        await resend.emails.send({
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
        })
      },
    }),
  ],
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          // v0's sandbox dev-preview tunnel uses a random subdomain per session
          // (e.g. https://sb-xxxx.vercel.run), so it must be trusted via wildcard.
          'https://*.vercel.run',
        ]
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
