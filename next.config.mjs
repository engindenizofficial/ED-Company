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
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
