'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient, signIn, signUp } from '@/lib/auth-client'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  // OTP akışı
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const isSignUp = mode === 'sign-up'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        const res = await signUp.email({ name, email, password })
        if (res.error) {
          setError(res.error.message ?? 'Kayıt sırasında bir hata oluştu.')
          return
        }
        setVerificationSent(true)
        return
      } else {
        // Şifre doğru mu önce kontrol et, ardından OTP gönder
        const res = await signIn.email({ email, password, dontRememberMe: true })
        if (res.error) {
          setError(res.error.message ?? 'E-posta veya şifre hatalı.')
          return
        }
        // Şifre doğru — OTP gönder ve oturumu kapat (OTP onaylanınca tekrar açılacak)
        await authClient.signOut()
        const otpRes = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
        if (otpRes.error) {
          setError('Doğrulama kodu gönderilemedi. Tekrar deneyin.')
          return
        }
        setOtpStep(true)
      }
    } catch {
      setError('Beklenmedik bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) {
      setError('Lütfen 6 haneli kodu eksiksiz girin.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await authClient.signIn.emailOtp({ email, otp: code })
      if (res.error) {
        setError('Kod hatalı veya süresi dolmuş.')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Beklenmedik bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  function handleOtpChange(index: number, value: string) {
    const val = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = val
    setOtp(next)
    if (val && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  if (otpStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">ED Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">Doğrulama kodu girin</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground text-center mb-6">
              <span className="font-semibold text-foreground">{email}</span> adresine 6 haneli kod gönderdik.
            </p>
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-5">
              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-12 w-10 rounded-lg border border-input bg-background text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                ))}
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-10 w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:opacity-80 transition disabled:opacity-50"
              >
                {loading ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
              </button>
            </form>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Kod gelmedi mi?{' '}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={async () => {
                setError('')
                await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
              }}
            >
              Tekrar gönder
            </button>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="hover:underline"
              onClick={() => { setOtpStep(false); setOtp(['', '', '', '', '', '']); setError('') }}
            >
              Geri dön
            </button>
          </p>
        </div>
      </div>
    )
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
            <h2 className="text-lg font-bold text-foreground mb-2">E-postanı Doğrula</h2>
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-semibold text-foreground">{email}</span> adresine doğrulama linki gönderdik.
            </p>
            <p className="text-xs text-muted-foreground">
              Spam klasörünü de kontrol etmeyi unutma.
            </p>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Zaten doğruladın mı?{' '}
            <Link href="/sign-in" className="font-semibold text-primary hover:underline">
              Giriş Yap
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ED Company</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignUp ? 'Hesap oluştur' : 'Hesabına giriş yap'}
          </p>
        </div>

        {/* Kart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Ad Soyad
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Adın Soyadın"
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                E-posta
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@mail.com"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Şifre
              </label>
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
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-10 w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:opacity-80 transition disabled:opacity-50"
            >
              {loading ? (isSignUp ? 'Kaydediliyor...' : 'Giriş yapılıyor...') : (isSignUp ? 'Kayıt Ol' : 'Giriş Yap')}
            </button>
          </form>
        </div>

        {/* Alt link */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              Zaten hesabın var mı?{' '}
              <Link href="/sign-in" className="font-semibold text-primary hover:underline">
                Giriş Yap
              </Link>
            </>
          ) : (
            <>
              Hesabın yok mu?{' '}
              <Link href="/sign-up" className="font-semibold text-primary hover:underline">
                Kayıt Ol
              </Link>
            </>
          )}
        </p>

        <p className="mt-2 text-center">
          <button
            type="button"
            onClick={() => {
              document.cookie = "guest_mode=1; path=/; SameSite=Lax"
              window.location.href = "/"
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Giriş yapmadan devam et
          </button>
        </p>
      </div>
    </div>
  )
}
