import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Sunucu process'i ayağa kalktığında (= her yeni deploy'da) bir kere üretilir.
// Vercel prod deploy'larında VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID zaten
// otomatik sağlanır; yoksa (yerel geliştirme gibi) process başlangıç zamanına
// düşer. Önemli olan: yeni bir deploy = yeni process = yeni değer.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `dev-${Date.now()}`

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  )
}
