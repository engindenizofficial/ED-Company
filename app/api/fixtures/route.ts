import { NextResponse } from "next/server"
import { getFixturesResponse, todayTR } from "@/lib/fixtures-server"

export const dynamic = "force-dynamic"

// Türkiye saatiyle dünün tarihini döndürür (YYYY-MM-DD).
function yesterdayTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() - 1)
  return trNow.toLocaleDateString("sv-SE")
}

// Türkiye saatiyle yarının tarihini döndürür (YYYY-MM-DD).
function tomorrowTR(): string {
  const now = new Date()
  const trNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }))
  trNow.setDate(trNow.getDate() + 1)
  return trNow.toLocaleDateString("sv-SE")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = searchParams.get("date")
  const today = todayTR()
  const yesterday = yesterdayTR()
  const tomorrow = tomorrowTR()
  // Sadece TR saatiyle "dün", "bugün" ve "yarın" desteklenir — başka bir
  // tarih istenirse (veya hiç istenmezse) güvenli varsayılan olarak bugüne
  // düşülür. Gece 00:00'da (TR saati) her üç tarih de otomatik kayar.
  const date = requested === yesterday || requested === tomorrow ? requested : today
  const refresh = searchParams.get("refresh") === "1"

  // Cache-then-fetch mantığı artık getFixturesResponse'da tek yerde —
  // app/page.tsx ve app/mac/[id]/page.tsx da sunucuda aynı fonksiyonu
  // çağırıp ilk HTML'i hazır veriyle üretebiliyor.
  const payload = await getFixturesResponse(date, refresh)
  return NextResponse.json(payload)
}
