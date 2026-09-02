"use client"

import Link from "next/link"
import { useLanguage } from "@/contexts/language-context"
import { useTimeZone } from "@/contexts/time-zone-context"
import { getDateKey } from "@/lib/fixture-datetime"

/**
 * Google AdSense onay süreci, sitede kalıcı ve her sayfadan erişilebilir
 * Gizlilik Politikası / Kullanım Koşulları / Hakkımızda / İletişim
 * bağlantıları bekler. Bu footer, kök layout'ta tüm sayfalarda (ana ekran
 * dahil) görünecek şekilde render edilir.
 */
export function SiteFooter() {
  const { t } = useLanguage()
  const timeZone = useTimeZone()
  const year = getDateKey(new Date(), timeZone).slice(0, 4)

  const links = [
    { href: "/gizlilik-politikasi", label: t("footer.privacyPolicy") },
    { href: "/kullanim-kosullari", label: t("footer.termsOfUse") },
    { href: "/hakkimizda", label: t("footer.aboutUs") },
    { href: "/iletisim", label: t("footer.contact") },
  ]

  return (
    <footer aria-label={t("footer.ariaLabel")} className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-3 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-col gap-1">
          <span className="select-none text-[12px] font-black tracking-[0.14em] uppercase">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>
            <span className="text-foreground/50 mx-1">/</span>
            <span className="text-foreground/75 font-semibold tracking-widest text-[11px]">ANALYTICS</span>
          </span>
          <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>

        <nav
          aria-label={t("footer.ariaLabel")}
          className="flex flex-nowrap items-center justify-center gap-x-1 sm:justify-end sm:gap-x-2"
        >
          {links.map((link, index) => (
            <span key={link.href} className="flex shrink-0 items-center gap-x-1 sm:gap-x-2">
              <Link
                href={link.href}
                className="text-[10px] font-medium tracking-tight text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground sm:text-xs sm:tracking-normal"
              >
                {link.label}
              </Link>
              {index < links.length - 1 && (
                <span aria-hidden="true" className="text-[10px] text-muted-foreground sm:text-xs">
                  •
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="border-t border-border/40">
        <p className="mx-auto max-w-4xl px-5 py-3 text-center text-[11px] text-muted-foreground sm:text-left">
          {t("footer.copyright", { year })}
        </p>
      </div>
    </footer>
  )
}
