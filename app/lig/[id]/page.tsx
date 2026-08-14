import type { Metadata } from "next"
import { getLeagueBasicInfo } from "@/lib/api-football"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { LeagueUrlOpener } from "@/components/league-url-opener"

export const dynamic = "force-dynamic"

interface LeaguePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: LeaguePageProps): Promise<Metadata> {
  const { id } = await params
  const locale = await getServerLocale()
  const info = await getLeagueBasicInfo(Number(id)).catch(() => null)
  const name = info?.league.name || "Lig"
  const title = translate(locale, "meta.league.title", { name })
  const description = translate(locale, "meta.league.description", { name })
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: info?.league.logo ? [{ url: info.league.logo }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

// Bkz. app/oyuncu/[id]/page.tsx — aynı kalıp: bu sayfa doğrudan ziyaret /
// paylaşılan link / sayfa yenileme için var, sadece mevcut global lig
// panelini bu ID'ye göre otomatik açan bir tetikleyici render eder.
export default async function LeaguePage({ params }: LeaguePageProps) {
  const { id } = await params
  const leagueId = Number(id)
  const info = await getLeagueBasicInfo(leagueId).catch(() => null)

  return (
    <>
      <main className="sr-only">
        <h1>{info?.league.name ?? "Lig"}</h1>
        {info?.league.country && <p>{info.league.country}</p>}
      </main>
      <LeagueUrlOpener
        id={leagueId}
        name={info?.league.name ?? ""}
        logo={info?.league.logo ?? ""}
        country={info?.league.country ?? ""}
        flagUrl={info?.league.flagUrl ?? null}
      />
    </>
  )
}
