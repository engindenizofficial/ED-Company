import { HomeClient } from "@/components/home-client"
import { getFixturesResponse, todayTR } from "@/lib/fixtures-server"
import { getAllTimePredictionResults } from "@/lib/redis"

export const dynamic = "force-dynamic"

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
  const [initialFixturesData, initialPredictionResults] = await Promise.all([
    getFixturesResponse(todayTR()),
    getAllTimePredictionResults(),
  ])
  return (
    <HomeClient
      initialFixturesData={initialFixturesData}
      initialPredictionResults={initialPredictionResults}
    />
  )
}
