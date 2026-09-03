import { headers } from "next/headers"
import { HomeClient } from "@/components/home-client"
import { getFixturesResponse } from "@/lib/fixtures-server"
import { getAllTimePredictionResults } from "@/lib/redis"
import { getRelativeDateKey, normalizeTimeZone, SERVER_TIME_ZONE } from "@/lib/fixture-datetime"

export const dynamic = "force-dynamic"

// Ana sayfa verileri her istekte güncel tutulur.
// Önceden bu sayfa "use client" idi ve HomeClient hiç veri olmadan mount
// oluyordu — bu yüzden ilk açılışta her zaman kısa bir süre "Maçlar
// yükleniyor" animasyonu görünüyordu (client fetch tamamlanana kadar).
// Artık bugünün fikstürlerini burada, sunucuda önceden çekip HomeClient'e
// initialFixturesData olarak veriyoruz — ilk HTML zaten dolu geldiği için
// o yükleniyor animasyonu hiç görünmüyor, site direkt açılıyor.
//
// Aynı sorun "Tahmin Başarısı" paneli için de vardı: predictionResults state'i
// [] ile başlıyor, veri sadece client tarafında (handleRefresh içinde) çekiliyordu
// — bu yüzden panel ilk saniyelerde hiç görünmüyor, sonra aniden beliriyordu.
// Bunu da burada sunucuda önceden çekip HomeClient'e initialPredictionResults
// olarak veriyoruz.
export default async function Page() {
  const requestHeaders = await headers()
  const timeZone = normalizeTimeZone(requestHeaders.get("x-vercel-ip-timezone"), SERVER_TIME_ZONE)
  const [initialFixturesData, initialPredictionResults] = await Promise.all([
    getFixturesResponse(getRelativeDateKey(0, timeZone), false, timeZone),
    getAllTimePredictionResults(),
  ])
  return (
    <HomeClient
      initialFixturesData={initialFixturesData}
      initialPredictionResults={initialPredictionResults}
    />
  )
}
