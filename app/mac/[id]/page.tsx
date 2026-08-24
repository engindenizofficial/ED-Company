import type { Metadata } from "next"
import { cache } from "react"
import { getFixtureById } from "@/lib/api-football"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { HomeClient } from "@/components/home-client"
import { MatchUrlOpener } from "@/components/match-url-opener"
import { getFixturesResponse, todayTR } from "@/lib/fixtures-server"

export const dynamic = "force-dynamic"

interface MatchPageProps {
  params: Promise<{ id: string }>
}

// generateMetadata VE sayfa component'i aynı fixture'ı ayrı ayrı çekiyordu —
// yani her sayfa görüntülemesinde harici API-Football'a 2 istek gidiyordu.
// React'in cache() sarmalayıcısı, aynı istek (request) içinde aynı argümanla
// yapılan çağrıları tekilleştirir: ikinci çağrı ağa gitmez, ilk sonucu
// paylaşır. Bu, harici API'nin gecikmesini/rate-limit riskini yarıya
// indiriyor ve sayfanın gerçekte "dönüp sonra açılması" hissinin başlıca
// sebebiydi — takım sayfası daha hafif bir uç noktaya (getTeamBasicInfo) tek
// seferde bağlanıyordu, maç sayfası ise iki kat daha ağır ve iki kat yavaştı.
const getCachedFixture = cache((id: number) => getFixtureById(id).catch(() => null))

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { id } = await params
  const locale = await getServerLocale()
  const fixture = await getCachedFixture(Number(id))
  const home = fixture?.home.name || "Ev Sahibi"
  const away = fixture?.away.name || "Konuk"
  const title = translate(locale, "meta.match.title", { home, away })
  const description = translate(locale, "meta.match.description", { home, away })
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image.png"] },
  }
}

// Bu route, ana sayfanın (app/page.tsx) aynı HomeClient component'ini
// render eder — maç paneli artık global bir context'te (MatchContext, kök
// layout'ta sağlanır) yaşadığı için HomeClient'e artık initialFixtureId /
// initialFixture geçmiyoruz. Bunun yerine MatchUrlOpener render edilir: o da
// sunucuda zaten çekilmiş olan fixture'ı (varsa) openMatch'e geçerek maç
// panelini otomatik açar — takım/lig panelinden bir maça tıklamak da aynı
// global paneli açtığı için davranış artık tüm giriş noktalarında ortak.
//
// Bkz. app/takim/[id]/page.tsx — SEO/crawler için aynı düzeltme: bu sayfa
// artık sunucuda maçın gerçek içeriğini (ev sahibi - konuk, skor, tarih)
// sr-only bir <main> içinde render ediyor. Önceden ilk HTML'de görünür
// içerik hiç yoktu — HomeClient client tarafında fikstür listesini çekip
// panel içinde bu bilgiyi gösteriyordu, bu da Google'ın ilk indirmede boş
// bir kabuk görüp "soft 404" olarak işaretlemesine yol açıyordu (takım
// sayfaları aynı sorunu yaşamıyordu çünkü zaten sunucuda sr-only içerik
// render ediyorlardı).
export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params
  // Ana sayfadaki gibi: bugünün fikstürleri burada sunucuda önceden çekilip
  // HomeClient'e initialFixturesData olarak geçilir — bu maç detay sayfası
  // arkada ana listeyi de render ettiği için o liste de "Maçlar yükleniyor"
  // animasyonu göstermeden, dolu haliyle mount olur.
  const [fixture, initialFixturesData] = await Promise.all([
    getCachedFixture(Number(id)),
    getFixturesResponse(todayTR()),
  ])
  const home = fixture?.home.name || "Ev Sahibi"
  const away = fixture?.away.name || "Konuk"
  const hasScore = fixture && (fixture.goalsHome !== null || fixture.goalsAway !== null)
  const dateLabel = fixture
    ? new Date(fixture.date).toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <>
      <main className="sr-only">
        <h1>
          {home} - {away}
          {hasScore ? ` (${fixture.goalsHome ?? 0} - ${fixture.goalsAway ?? 0})` : ""}
        </h1>
        {fixture?.league?.name && <p>{fixture.league.name}</p>}
        {dateLabel && <p>{dateLabel}</p>}
        {fixture?.venue && <p>{fixture.venue}</p>}
      </main>
      {/*
        fixture zaten burada (sunucuda) çekildiği için MatchUrlOpener'a
        initialFixture olarak da geçiyoruz — bu sayede maç paneli ilk
        render'da anında açılır, "ana ekranda dönüp sonra panel açılması"
        (bugünün fikstür listesinin client'ta yüklenmesini bekleme) ortadan
        kalkar. Maç bulunamazsa (fixture null) MatchContext eski davranışına
        (yalnızca id ile tekli fetch) geri döner.
      */}
      <HomeClient initialFixturesData={initialFixturesData} />
      <MatchUrlOpener id={Number(id)} fixture={fixture ?? undefined} />
    </>
  )
}
