'use client'

import { useEffect } from 'react'

// Google OAuth popup akışının son adımı. better-auth, OAuth callback'ini
// işledikten sonra kullanıcıyı buraya yönlendirir. Bu sayfa popup içinde
// açıldığı için amacı tek şey: pencereyi kapatmak. Ana sekmedeki
// `handleGoogleAuth` fonksiyonu popup'ın kapandığını algılayıp oturumu
// kontrol edecek ve kullanıcıyı ana sekmede yönlendirecek.
export default function PopupCallbackPage() {
  useEffect(() => {
    if (window.opener) {
      window.close()
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Giriş tamamlanıyor...</p>
    </div>
  )
}
