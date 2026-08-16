"use client"

import Link from "next/link"
import { Shield, Swords, Zap } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"

export function GamesHubContent() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            {t("games.testYourKnowledge")}
          </span>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">{t("games.title")}</h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {t("games.subtitle")}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/oyunlar/kulubunu-kur"
            className="arena-scope group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-emerald-500/25 bg-[oklch(0.14_0.03_155)] p-5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)] transition-all hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-[0_20px_50px_-16px_oklch(0.65_0.19_155)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,oklch(0.65_0.19_155)_22%,transparent),transparent_65%)] opacity-80 transition-opacity group-hover:opacity-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(color-mix(in_oklch,white_4%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,white_4%,transparent)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40"
            />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <Shield className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-black uppercase italic tracking-tight text-foreground">
                {t("managerCareer.title")}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("managerCareer.subtitle")}</p>
            </div>
            <div className="relative mt-4 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-400">
              <Zap className="h-3.5 w-3.5 fill-emerald-400" />
              {t("games.enterArena")}
            </div>
          </Link>

          <Link
            href="/oyunlar/piyasa-degeri-duellosu"
            className="arena-scope group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-primary/25 bg-[oklch(0.12_0.016_250)] p-5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)] transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_20px_50px_-16px_var(--primary)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_65%)] opacity-80 transition-opacity group-hover:opacity-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(color-mix(in_oklch,white_4%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,white_4%,transparent)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40"
            />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <Swords className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-black uppercase italic tracking-tight text-foreground">
                {t("games.marketValueDuel")}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {t("games.marketValueDuelDesc")}
              </p>
            </div>
            <div className="relative mt-4 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-primary">
              <Zap className="h-3.5 w-3.5 fill-primary" />
              {t("games.enterArena")}
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
