"use client"

import { useLanguage } from "@/contexts/language-context"
import { legalContent } from "@/lib/i18n/legal-content"
import { LegalPageShell } from "@/components/legal-page-shell"

export function PrivacyPolicyContent() {
  const { locale } = useLanguage()
  const { title, body } = legalContent[locale].privacy

  return (
    <LegalPageShell title={title} showUpdatedLabel>
      {body}
    </LegalPageShell>
  )
}
