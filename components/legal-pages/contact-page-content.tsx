"use client"

import { Mail, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/contexts/language-context"
import { ContactForm } from "@/components/contact-form"

export function ContactPageContent() {
  const { t } = useLanguage()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
      <Link
        href="/"
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("common.back")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">{t("contact.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("contact.description")}</p>
      </div>

      <a
        href="mailto:support@edcompanyofficial.com"
        className="flex w-fit items-center gap-2 rounded-lg border border-border/60 bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        support@edcompanyofficial.com
      </a>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">{t("contact.formTitle")}</h2>
        <ContactForm />
      </div>
    </main>
  )
}
