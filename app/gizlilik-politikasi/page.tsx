import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { PrivacyPolicyContent } from "@/components/legal-pages/privacy-policy-content"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.privacyPolicy.title"),
    description: translate(locale, "meta.privacyPolicy.description"),
  }
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />
}
