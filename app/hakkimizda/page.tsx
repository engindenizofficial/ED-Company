import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { AboutUsContent } from "@/components/legal-pages/about-us-content"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.aboutUs.title"),
    description: translate(locale, "meta.aboutUs.description"),
  }
}

export default function AboutUsPage() {
  return <AboutUsContent />
}
