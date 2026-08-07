'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, signUp } from '@/lib/auth-client'

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
      } else {
        const res = await signIn.email({ email, password })
        if (res.error) {
          setError(res.error.message ?? 'Giriş sırasında bir hata oluştu.')
          return
        }
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Beklenmedik bir hata oluştu.')
    } finally {
      setLoading(false)
    }
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
