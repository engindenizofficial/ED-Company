import type { Metadata } from "next"
import { MarketValueDuelHero } from "@/components/games/market-value-duel-hero"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.marketValueDuel.title"),
    description: translate(locale, "meta.marketValueDuel.description"),
  }
}

export default function MarketValueDuelPage() {
  return <MarketValueDuelHero />
}
