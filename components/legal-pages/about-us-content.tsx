"use client"

import { useLanguage } from "@/contexts/language-context"
import { legalContent } from "@/lib/i18n/legal-content"
import { LegalPageShell } from "@/components/legal-page-shell"

export function AboutUsContent() {
  const { locale } = useLanguage()
  const { title, body } = legalContent[locale].about

  return (
    <LegalPageShell title={title}>
      {body}
    </LegalPageShell>
  )
}
