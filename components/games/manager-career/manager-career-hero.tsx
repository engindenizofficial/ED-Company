"use client"

import Link from "next/link"
import { ChevronLeft, Shield } from "lucide-react"
import { ManagerCareerWizard } from "@/components/games/manager-career/manager-career-wizard"
import { useLanguage } from "@/contexts/language-context"

export function ManagerCareerHero() {
  const { t } = useLanguage()

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <header className="relative z-10 border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-6">
          <Link
            href="/oyunlar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("nav.games")}
          </Link>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30">
              <Shield className="h-5.5 w-5.5" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tight text-foreground">
                {t("managerCareer.title")}
              </h1>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{t("managerCareer.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-5 py-6">
        <ManagerCareerWizard />
      </main>
    </div>
  )
}
