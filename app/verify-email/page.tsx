'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setErrorMessage('Geçersiz doğrulama linki.')
      return
    }

    authClient.verifyEmail({ query: { token } })
      .then((res) => {
        if (res.error) {
          setStatus('error')
          setErrorMessage(res.error.message ?? 'Doğrulama başarısız oldu.')
        } else {
          setStatus('success')
          setTimeout(() => router.push('/'), 2000)
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMessage('Beklenmedik bir hata oluştu.')
      })
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {status === 'loading' && (
            <>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">E-posta doğrulanıyor...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">E-posta Doğrulandı</h2>
              <p className="text-sm text-muted-foreground">Hesabın aktifleşti. Ana sayfaya yönlendiriliyorsun...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Doğrulama Başarısız</h2>
              <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
              <Link
                href="/sign-in"
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition"
              >
                Giriş Sayfasına Dön
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
