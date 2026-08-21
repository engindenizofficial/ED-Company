"use client"

import { CalendarDays, Gamepad2, KeyRound, UserPlus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "@/lib/auth-client"
import { FavoritesMenu } from "@/components/favorites-menu"
import { LanguageSwitcher } from "@/components/language-switcher"
import { isAdminEmail } from "@/lib/admin"
import { useLanguage } from "@/contexts/language-context"

export function NavTabs() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = isAdminEmail(session?.user?.email)
  const { t } = useLanguage()

  const tabs = [
    { href: "/", label: t("nav.matches"), icon: CalendarDays },
    { href: "/oyunlar", label: t("nav.games"), icon: Gamepad2 },
  ]

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border bg-background"
      aria-label={t("nav.ariaLabel")}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-1 px-3 sm:px-5">
        {/* Hamburger (sadece giriş yapmış kullanıcılar) + Logo sol */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          <FavoritesMenu />
          <Link
            href="/"
            className="select-none whitespace-nowrap text-[12px] font-black tracking-[0.14em] uppercase sm:text-[13px] sm:tracking-[0.18em]"
            aria-label={t("nav.backToHome")}
          >
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>
            <span className="text-foreground/50 mx-1">/</span>
            <span className="hidden text-foreground/75 font-semibold tracking-widest text-[11px] sm:inline">
              ANALYTICS
            </span>
          </Link>
        </div>

        {/* Sağ: Tabs + Auth */}
        <div className="flex min-w-0 items-center gap-0">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" ||
                  (!pathname.startsWith("/player") &&
                    !pathname.startsWith("/league") &&
                    !pathname.startsWith("/team") &&
                    !pathname.startsWith("/oyunlar"))
                : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1 px-2 py-3.5 text-[11px] font-semibold tracking-wide uppercase transition-colors sm:gap-1.5 sm:px-4 sm:text-xs",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] brand-gradient rounded-full" />
                )}
              </Link>
            )
          })}

          {/* Auth butonları — mobilde yer kısıtlı olduğu için giriş/dil seçimi hamburger menüsüne taşınır */}
          <div className="ml-1 hidden items-center gap-1.5 border-l border-border/60 pl-2 sm:ml-2 sm:flex sm:pl-2">
            {session?.user ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                  {session.user.name}
                </span>
                {isAdmin && (
                  <span className="brand-gradient bg-clip-text text-transparent text-[10px] font-black tracking-[0.15em] uppercase">
                    {t("nav.admin")}
                  </span>
                )}
              </span>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{t("nav.signIn")}</span>
                </Link>
                <Link
                  href="/sign-up"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{t("nav.signUp")}</span>
                </Link>
              </>
            )}
            <div className="ml-1.5">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
