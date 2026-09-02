'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/contexts/language-context'

// Google OAuth popup akışının son adımı. better-auth, OAuth callback'ini
// işledikten sonra kullanıcıyı buraya yönlendirir. Bu sayfa popup içinde
// açıldığı için amacı tek şey: pencereyi kapatmak. Ana sekmedeki
// `handleGoogleAuth` fonksiyonu popup'ın kapandığını algılayıp oturumu
// kontrol edecek ve kullanıcıyı ana sekmede yönlendirecek.
export default function PopupCallbackPage() {
  const { t } = useLanguage()

  useEffect(() => {
    const message = { type: 'google-oauth-complete' }
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('ed-google-auth')
      : null

    channel?.postMessage(message)
    window.opener?.postMessage(message, window.location.origin)

    // OAuth sağlayıcıları Cross-Origin-Opener-Policy nedeniyle `window.opener`
    // bağlantısını koparabilir. Pencere yine de uygulama tarafından açıldığı
    // için opener kontrolü yapmadan kapatmayı denemeliyiz.
    const closeTimer = window.setTimeout(() => {
      channel?.close()
      window.close()
    }, 100)

    return () => {
      window.clearTimeout(closeTimer)
      channel?.close()
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{t('auth.completingSignIn')}</p>
    </div>
  )
}
