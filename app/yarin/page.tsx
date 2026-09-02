import type { Metadata } from "next"
import { headers } from "next/headers"
import { HomeClient } from "@/components/home-client"
import { getFixturesResponse } from "@/lib/fixtures-server"
import { getRelativeDateKey, normalizeTimeZone, SERVER_TIME_ZONE } from "@/lib/fixture-datetime"
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
  const requestHeaders = await headers()
  const timeZone = normalizeTimeZone(requestHeaders.get("x-vercel-ip-timezone"), SERVER_TIME_ZONE)
  const [initialFixturesData, initialPredictionResults] = await Promise.all([
    getFixturesResponse(getRelativeDateKey(1, timeZone), false, timeZone),
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
