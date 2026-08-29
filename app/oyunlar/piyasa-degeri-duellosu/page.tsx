import type { Metadata } from "next"
import { GameDataEmptyState } from "@/components/games/game-data-empty-state"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, "meta.marketValueDuel.title")
  const description = translate(locale, "meta.marketValueDuel.description")
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default function MarketValueDuelPage() {
  return (
    <GameDataEmptyState
      title="Piyasa Değeri Düellosu"
      description="Oyuncu piyasa değeri verileri şu anda mevcut değil. Yeni veri kaynağı eklendiğinde oyun yeniden açılacak."
    />
  )
}
