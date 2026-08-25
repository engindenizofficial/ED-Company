/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    // Sunucu tarafındaki VAPID_PUBLIC_KEY'i client'a expose eder — kullanıcıdan
    // aynı değeri ikinci kez istemeye gerek kalmaz (Web Push abonelik akışı
    // bu anahtarı tarayıcıda kullanır, private key sunucuda kalır).
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  },
  images: {
    // NOT: `/_next/image` optimizasyon proxy'sini media.api-sports.io logoları
    // için denedik, ancak bu VM'in geliştirme önizleme sarmalayıcısı
    // `/_next/image` isteklerini Next'in dahili image handler'ına değil
    // uygulamanın kendi sayfa yönlendiricisine düşürüyor (404 sayfası
    // dönüyor). `unoptimized: true` bilerek böyle bırakıldı — kaldırılırsa
    // önizlemede tüm logolar kırılır.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // "same-origin-allow-popups" (değil "same-origin") kullanılıyor çünkü
          // Google giriş akışı bir OAuth popup'ı açıyor; daha sıkı değer bu
          // popup'ın window.opener referansını koparıp girişi kırabilir.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        // İkonlar, manifest ve OG görseli build çıktısına gömülü, içerik
        // değiştiğinde dosya adı/deploy değişir — bu yüzden agresif ve
        // "immutable" cache'lenebilirler. Service worker (sw.js) burada
        // KASITLI olarak hariç: PWA güncellemelerinin anında yayılması için
        // her zaman yeniden doğrulanmalı, aksi halde kullanıcılar eski bir
        // service worker'a kilitlenebilir.
        source: '/:path(icon-192.png|icon-512.png|apple-touch-icon.png|opengraph-image.png|manifest.json)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

export default nextConfig
