import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server-locale"
import { translate } from "@/lib/i18n/dictionaries"
import { ContactPageContent } from "@/components/legal-pages/contact-page-content"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return {
    title: translate(locale, "meta.contact.title"),
    description: translate(locale, "meta.contact.description"),
  }
}

export default function ContactPage() {
  return <ContactPageContent />
}
