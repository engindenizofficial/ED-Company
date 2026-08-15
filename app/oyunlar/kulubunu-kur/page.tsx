import type { Metadata } from "next"
import { ManagerCareerHero } from "@/components/games/manager-career/manager-career-hero"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, "meta.managerCareer.title")
  const description = translate(locale, "meta.managerCareer.description")
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default function ManagerCareerPage() {
  return <ManagerCareerHero />
}
