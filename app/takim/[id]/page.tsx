import type { Metadata } from "next"
import { getTeamBasicInfo } from "@/lib/api-football"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { TeamUrlOpener } from "@/components/team-url-opener"

export const dynamic = "force-dynamic"

interface TeamPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { id } = await params
  const locale = await getServerLocale()
  const info = await getTeamBasicInfo(Number(id)).catch(() => null)
  const name = info?.team.name || "Takım"
  const title = translate(locale, "meta.team.title", { name })
  const description = translate(locale, "meta.team.description", { name })
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: info?.team.logo ? [{ url: info.team.logo }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

// Bkz. app/oyuncu/[id]/page.tsx — aynı kalıp: bu sayfa doğrudan ziyaret /
// paylaşılan link / sayfa yenileme için var, sadece mevcut global takım
// panelini bu ID'ye göre otomatik açan bir tetikleyici render eder.
export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params
  const teamId = Number(id)
  const info = await getTeamBasicInfo(teamId).catch(() => null)

  return (
    <>
      <main className="sr-only">
        <h1>{info?.team.name ?? "Takım"}</h1>
        {info?.venue.name && <p>{info.venue.name}</p>}
      </main>
      <TeamUrlOpener id={teamId} name={info?.team.name ?? ""} logo={info?.team.logo ?? ""} />
    </>
  )
}
