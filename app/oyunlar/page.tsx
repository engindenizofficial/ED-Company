import type { Metadata } from "next"
import { GamesHubContent } from "@/components/games/games-hub-content"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, "meta.games.title")
  const description = translate(locale, "meta.games.description")
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default function GamesHubPage() {
  return <GamesHubContent />
}
