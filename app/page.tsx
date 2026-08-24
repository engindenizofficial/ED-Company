import { HomeClient } from "@/components/home-client"
import { getFixturesResponse, todayTR } from "@/lib/fixtures-server"

export const dynamic = "force-dynamic"

// Önceden bu sayfa "use client" idi ve HomeClient hiç veri olmadan mount
// oluyordu — bu yüzden ilk açılışta her zaman kısa bir süre "Maçlar
// yükleniyor" animasyonu görünüyordu (client fetch tamamlanana kadar).
// Artık bugünün fikstürlerini burada, sunucuda önceden çekip HomeClient'e
// initialFixturesData olarak veriyoruz — ilk HTML zaten dolu geldiği için
// o yükleniyor animasyonu hiç görünmüyor, site direkt açılıyor.
export default async function Page() {
  const initialFixturesData = await getFixturesResponse(todayTR())
  return <HomeClient initialFixturesData={initialFixturesData} />
}
