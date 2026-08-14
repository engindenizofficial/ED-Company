import type { Metadata } from "next"
import { GamesHubContent } from "@/components/games/games-hub-content"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.games.title"),
    description: translate(locale, "meta.games.description"),
  }
}

export default function GamesHubPage() {
  return <GamesHubContent />
}
