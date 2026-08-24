import type { Metadata } from "next"
import { HomeClient } from "@/components/home-client"
import { getFixturesResponse, yesterdayTR } from "@/lib/fixtures-server"
import { getAllTimePredictionResults } from "@/lib/redis"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export const dynamic = "force-dynamic"

// Ana sayfadaki (app/page.tsx) "Dün" sekmesinin kendi rotası. Önceden
// "Dün"/"Bugün"/"Yarın" arasında geçiş yapmak URL'i hiç değiştirmiyordu —
// üçü de "/" üzerinde kalıyordu, bu yüzden dünün maçları paylaşılamıyor/
// yer imine eklenemiyor/geri tuşuyla ayırt edilemiyordu. Bu sayfa,
// app/page.tsx ile aynı HomeClient'i, sadece dünün tarihi için sunucuda
// önceden çekilmiş veriyle render eder — bkz. components/home-client.tsx
// içindeki DATE_TAB_PATHS / initialDateTab.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.yesterday.title"),
    description: translate(locale, "meta.yesterday.description"),
  }
}

export default async function YesterdayPage() {
  const [initialFixturesData, initialPredictionResults] = await Promise.all([
    getFixturesResponse(yesterdayTR()),
    getAllTimePredictionResults(),
  ])
  return (
    <HomeClient
      initialFixturesData={initialFixturesData}
      initialPredictionResults={initialPredictionResults}
      initialDateTab="yesterday"
    />
  )
}
