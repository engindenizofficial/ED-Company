import type { Metadata } from "next"
import { getPlayerBasicProfile } from "@/lib/api-football"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { PlayerUrlOpener } from "@/components/player-url-opener"

export const dynamic = "force-dynamic"

interface PlayerPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { id } = await params
  const locale = await getServerLocale()
  const profile = await getPlayerBasicProfile(Number(id)).catch(() => null)
  const name = profile?.name || "Oyuncu"
  const title = translate(locale, "meta.player.title", { name })
  const description = translate(locale, "meta.player.description", { name })
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: profile?.photo ? [{ url: profile.photo }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

// Bu sayfa doğrudan ziyaret / paylaşılan link / sayfa yenileme için var —
// uygulama içi tıklamalarda panel her zamanki gibi mevcut sayfanın üzerinde
// bir overlay olarak açılır (bkz. contexts/player-context.tsx,
// components/player-panel.tsx). Burada sadece aynı paneli bu URL'e göre
// otomatik açan bir tetikleyici + arama motorları için minimal, crawl
// edilebilir bir başlık render ediyoruz.
export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id } = await params
  const playerId = Number(id)
  const profile = await getPlayerBasicProfile(playerId).catch(() => null)

  return (
    <>
      <main className="sr-only">
        <h1>{profile?.name ?? "Oyuncu"}</h1>
        {profile?.position && <p>{profile.position}</p>}
        {profile?.team?.name && <p>{profile.team.name}</p>}
      </main>
      <PlayerUrlOpener id={playerId} name={profile?.name ?? ""} photo={profile?.photo ?? null} />
    </>
  )
}
