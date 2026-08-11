"use client"

import { CalendarDays, KeyRound, UserPlus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "@/lib/auth-client"
import { FavoritesMenu } from "@/components/favorites-menu"
import { isAdminEmail } from "@/lib/admin"

const tabs = [
  { href: "/", label: "Maçlar", icon: CalendarDays },
]

export function NavTabs() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = isAdminEmail(session?.user?.email)

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md"
      aria-label="Ana navigasyon"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5">
        {/* Hamburger (sadece giriş yapmış kullanıcılar) + Logo sol */}
        <div className="flex items-center gap-2">
          <FavoritesMenu />
          <span className="select-none text-[13px] font-black tracking-[0.18em] uppercase">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>
            <span className="text-foreground/30 mx-1">/</span>
            <span className="text-foreground/60 font-semibold tracking-widest text-[11px]">ANALYTICS</span>
          </span>
        </div>

        {/* Sağ: Tabs + Auth */}
        <div className="flex items-center gap-0">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === "/" || (!pathname.startsWith("/player") && !pathname.startsWith("/league") && !pathname.startsWith("/team"))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold tracking-wide uppercase transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] brand-gradient rounded-full" />
                )}
              </Link>
            )
          })}

          {/* Auth butonları */}
          <div className="ml-2 flex items-center gap-1.5 pl-2 border-l border-border/60">
            {session?.user ? (
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium max-w-[100px] truncate">
                  {session.user.name}
                </span>
                {isAdmin && (
                  <span className="brand-gradient bg-clip-text text-transparent text-[10px] font-black tracking-[0.15em] uppercase">
                    Admin
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
                  <span className="hidden sm:inline">Giriş</span>
                </Link>
                <Link
                  href="/sign-up"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Kayıt Ol</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
