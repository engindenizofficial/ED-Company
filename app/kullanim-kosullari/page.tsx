import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { TermsOfUseContent } from "@/components/legal-pages/terms-of-use-content"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.termsOfUse.title"),
    description: translate(locale, "meta.termsOfUse.description"),
  }
}

export default function TermsOfUsePage() {
  return <TermsOfUseContent />
}
