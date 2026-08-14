import type { Metadata } from "next"
import { getFixtureById } from "@/lib/api-football"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { HomeClient } from "@/components/home-client"

export const dynamic = "force-dynamic"

interface MatchPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { id } = await params
  const locale = await getServerLocale()
  const fixture = await getFixtureById(Number(id)).catch(() => null)
  const home = fixture?.home.name || "Ev Sahibi"
  const away = fixture?.away.name || "Konuk"
  return {
    title: translate(locale, "meta.match.title", { home, away }),
    description: translate(locale, "meta.match.description", { home, away }),
  }
}

// Bu route, ana sayfanın (app/page.tsx) aynı HomeClient component'ini
// render eder, sadece bir initialFixtureId ile — HomeClient bu ID'yi bugünün
// fikstür listesinde bulur ya da (listede yoksa) tek başına çeker ve maç
// panelini otomatik açar. Böylece bir maça paylaşılabilir/yenilenebilir bir
// URL kazandırılırken ana sayfanın tüm mantığı (canlı yenileme, tahminler,
// favori takımlar vb.) tekrar yazılmadan aynen kullanılır.
export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params
  return <HomeClient initialFixtureId={Number(id)} />
}
