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
  const [googleLoading, setGoogleLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  async function handleGoogleAuth() {
    setError('')
    setGoogleLoading(true)

    // Popup'ı tıklama anında senkron olarak aç (about:blank). Bu, tarayıcının
    // popup engelleyicisinin "kullanıcı eylemi" saymas için gereklidir — aradaki
    // await'ten sonra window.open çağrılırsa bazı tarayıcılar bunu engelleyip
    // (veya farklı davranıp) her ortamda tutarsız bir sonuca yol açar.
    const popup = window.open('', 'google-oauth', 'width=480,height=640')
    if (!popup) {
      setError('Google penceresi açılamadı. Tarayıcınızın pop-up engelleyicisini kontrol edin.')
      setGoogleLoading(false)
      return
    }

    try {
      const res = await authClient.signIn.social({
        provider: 'google',
        // Popup, OAuth tamamlandığında ana siteyi değil bu küçük sayfayı
        // yükler; o sayfa kendini kapatır. Böylece popup içinde tüm site
        // açılmaz — kullanıcı hesabı seçtikten sonra popup kapanır ve
        // aşağıdaki `checkClosed` mantığı ana sekmeyi yönlendirir.
        callbackURL: '/auth/popup-callback',
        disableRedirect: true,
      })
      const authUrl = res.data?.url
      if (res.error || !authUrl) {
        popup.close()
        setError(res.error?.message ?? 'Google ile bağlantı kurulamadı.')
        setGoogleLoading(false)
        return
      }

      popup.location.href = authUrl

      // Popup kapanana kadar bekle, sonra oturumu kontrol et. Cookie'nin
      // popup'ta set edilip ana sekmede okunabilir olması bir tık gecikebilir
      // (redirect zinciri + tarayıcı cookie senkronizasyonu), bu yüzden tek
      // seferlik kontrol yerine kısa aralıklarla birkaç kez deniyoruz.
      const checkClosed = window.setInterval(async () => {
        if (popup.closed) {
          window.clearInterval(checkClosed)

          let session = await authClient.getSession()
          for (let attempt = 0; attempt < 5 && !session.data; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 400))
            session = await authClient.getSession()
          }

          if (session.data) {
            // router.push yerine tam sayfa navigasyonu: middleware'in güncel
            // session cookie'sini görmesini garantiler.
            window.location.href = '/'
          } else {
            setGoogleLoading(false)
            setError(
              'Google girişi tamamlandı ama oturum bu sekmede algılanamadı. Lütfen sayfayı yenileyip tekrar deneyin.',
            )
          }
        }
      }, 500)
    } catch {
      popup.close()
      setError('Beklenmedik bir hata oluştu.')
      setGoogleLoading(false)
    }
  }

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
            {googleLoading ? 'Yönlendiriliyor...' : isSignUp ? "Google ile Kayıt Ol" : 'Google ile Giriş Yap'}
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">veya</span>
            <span className="h-px flex-1 bg-border" />
          </div>

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
              try {
                sessionStorage.setItem("guest_mode", "1")
              } catch {}
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
