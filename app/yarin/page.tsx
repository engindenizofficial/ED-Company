import type { Metadata } from "next"
import { HomeClient } from "@/components/home-client"
import { getFixturesResponse, tomorrowTR } from "@/lib/fixtures-server"
import { getAllTimePredictionResults } from "@/lib/redis"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export const dynamic = "force-dynamic"

// Ana sayfadaki (app/page.tsx) "Yarın" sekmesinin kendi rotası — bkz.
// app/dun/page.tsx'teki aynı açıklama. Bu sayfa, aynı HomeClient'i yarının
// tarihi için sunucuda önceden çekilmiş veriyle render eder.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.tomorrow.title"),
    description: translate(locale, "meta.tomorrow.description"),
  }
}

export default async function TomorrowPage() {
  const [initialFixturesData, initialPredictionResults] = await Promise.all([
    getFixturesResponse(tomorrowTR()),
    getAllTimePredictionResults(),
  ])
  return (
    <HomeClient
      initialFixturesData={initialFixturesData}
      initialPredictionResults={initialPredictionResults}
      initialDateTab="tomorrow"
    />
  )
}
