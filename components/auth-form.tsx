'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient, signIn, signUp } from '@/lib/auth-client'
import { useLanguage } from '@/contexts/language-context'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

const credentialErrorCodes = new Set([
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_PASSWORD',
  'USER_NOT_FOUND',
])

function isCredentialError(code: string | undefined) {
  return credentialErrorCodes.has(code ?? '')
}

async function waitForSession() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await authClient.getSession()
    if (result.data?.session) return true
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }
  return false
}

export function AuthForm({ mode }: AuthFormProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [showVerificationAction, setShowVerificationAction] = useState(false)
  const [existingAccount, setExistingAccount] = useState(false)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [verificationFeedback, setVerificationFeedback] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  async function handleGoogleAuth() {
    setError('')
    setGoogleLoading(true)

    try {
      // Mobil Chrome, `window.open` ile başlatılan OAuth akışını ayrı bir özel
      // sekmede açıyor ve güvenlik nedeniyle bu sekmenin güvenilir biçimde
      // kapanmasına izin vermiyor. Better Auth'ın standart aynı-sekme akışı
      // kullanıcıyı Google'dan doğrudan ana sayfaya geri getirir.
      const res = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      })

      if (res.error) {
        setError(res.error.message ?? t('auth.googleConnectFailed'))
        setGoogleLoading(false)
      }
    } catch {
      setError(t('auth.networkError'))
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setShowVerificationAction(false)
    setExistingAccount(false)
    setLoading(true)

    try {
      if (isSignUp) {
        const res = await signUp.email({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          callbackURL: '/',
        })
        if (res.error) {
          const code = res.error.code ?? ''
          const accountExists = code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          setExistingAccount(accountExists)
          setShowVerificationAction(!accountExists)
          setError(accountExists ? t('auth.accountAlreadyExists') : t('auth.signUpEmailDeliveryFailed'))
          return
        }
        setVerificationSent(true)
        return
      }

      const res = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
        rememberMe: true,
        callbackURL: '/',
      })
      if (res.error) {
        const unverified = res.error.code === 'EMAIL_NOT_VERIFIED'
        setShowVerificationAction(unverified)
        setError(
          unverified
            ? t('auth.emailNotVerified')
            : isCredentialError(res.error.code)
              ? t('auth.wrongCredentials')
              : t('auth.signInError'),
        )
        return
      }

      const sessionReady = await waitForSession()
      if (!sessionReady) {
        setError(t('auth.sessionNotDetected'))
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setError(t('auth.networkError'))
    } finally {
      setLoading(false)
    }
  }

  async function resendVerificationEmail() {
    if (!email || resendingVerification) return
    setResendingVerification(true)
    setError('')
    setVerificationFeedback('')

    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim().toLowerCase(),
        callbackURL: `${window.location.origin}/`,
      })

      if (result.error) {
        setError(t('auth.verificationSendFailed'))
        setVerificationFeedback(t('auth.verificationSendFailed'))
        return
      }

      setVerificationSent(true)
      setVerificationFeedback(t('auth.verificationResent'))
    } catch {
      setError(t('auth.verificationSendFailed'))
      setVerificationFeedback(t('auth.verificationSendFailed'))
    } finally {
      setResendingVerification(false)
    }
  }

  if (verificationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">{t('auth.verifyEmailTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-semibold text-foreground">{email}</span> {t('auth.verifyEmailSentTo')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('auth.checkSpam')}
            </p>
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={resendVerificationEmail}
                disabled={resendingVerification}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                {resendingVerification ? t('auth.sendingVerification') : t('auth.resendVerification')}
              </button>
              {verificationFeedback ? (
                <p
                  className={error ? 'text-xs font-medium text-destructive' : 'text-xs font-medium text-primary'}
                  role="status"
                  aria-live="polite"
                >
                  {verificationFeedback}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth.alreadyVerified')}{' '}
            <Link href="/sign-in" className="font-semibold text-primary hover:underline">
              {t('auth.signIn')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Başlık */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('auth.appName')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignUp ? t('auth.createAccount') : t('auth.signInToAccount')}
          </p>
        </div>

        {/* Kart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-semibold text-foreground hover:bg-muted active:bg-muted/80 transition disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v9.02h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.68z" />
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.32l-7.11-5.52c-1.97 1.32-4.49 2.11-7.45 2.11-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
              <path fill="#FBBC05" d="M11.69 28.2c-.43-1.28-.68-2.65-.68-4.2s.25-2.92.68-4.2v-5.7H4.34C2.85 17.1 2 20.44 2 24s.85 6.9 2.34 9.9l7.35-5.7z" />
              <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.1l7.35 5.7c1.73-5.2 6.58-9.05 12.31-9.05z" />
            </svg>
            {googleLoading ? t('auth.redirecting') : isSignUp ? t('auth.signUpWithGoogle') : t('auth.continueWithGoogle')}
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">{t('common.or')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  {t('auth.fullName')}
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  {t('auth.password')}
                </label>
                {!isSignUp && (
                  <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    {t('auth.forgotPassword')}
                  </Link>
                )}
              </div>
              <input
                id="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            {error && (
              <div className="flex flex-col gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium" role="alert">
                <p>{error}</p>
                {showVerificationAction ? (
                  <button
                    type="button"
                    onClick={resendVerificationEmail}
                    disabled={resendingVerification}
                    className="self-start font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {resendingVerification ? t('auth.sendingVerification') : t('auth.resendVerification')}
                  </button>
                ) : null}
                {existingAccount ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link href="/sign-in" className="font-semibold text-primary hover:underline">
                      {t('auth.signIn')}
                    </Link>
                    <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
                      {t('auth.forgotPassword')}
                    </Link>
                  </div>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-10 w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:opacity-80 transition disabled:opacity-50"
            >
              {loading ? (isSignUp ? t('auth.signingUp') : t('auth.signingIn')) : (isSignUp ? t('auth.signUp') : t('auth.signIn'))}
            </button>
          </form>
        </div>

        {/* Alt link */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              {t('auth.alreadyHaveAccount')}{' '}
              <Link href="/sign-in" className="font-semibold text-primary hover:underline">
                {t('auth.signIn')}
              </Link>
            </>
          ) : (
            <>
              {t('auth.noAccount')}{' '}
              <Link href="/sign-up" className="font-semibold text-primary hover:underline">
                {t('auth.signUp')}
              </Link>
            </>
          )}
        </p>

        <p className="mt-2 text-center">
          <button
            type="button"
            onClick={() => {
              document.cookie = "guest_mode=1; path=/; SameSite=Lax"
              try {
                sessionStorage.setItem("guest_mode", "1")
              } catch {}
              router.push("/")
              router.refresh()
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            {t('auth.continueWithoutSignIn')}
          </button>
        </p>
      </div>
    </div>
  )
}
