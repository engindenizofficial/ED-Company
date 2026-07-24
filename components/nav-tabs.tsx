"use client"

import { CalendarDays, Trophy, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/", label: "Maçlar", icon: CalendarDays },
  { href: "/players", label: "Oyuncular", icon: Users },
  { href: "/leagues", label: "Ligler", icon: Trophy },
]

export function NavTabs() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-md"
      style={{ boxShadow: "var(--shadow-nav)" }}
      aria-label="Ana navigasyon"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-0">
        {/* Logo / Brand */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 py-3 text-sm font-black tracking-tight"
          aria-label="Ana sayfa"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-primary-foreground"
            style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))", boxShadow: "var(--glow-primary)" }}
          >
            ED
          </span>
          <span className="hidden text-foreground sm:block">
            <span className="brand-gradient bg-clip-text text-transparent">Analiz</span>
          </span>
        </Link>

        {/* Tabs */}
        <div className="flex items-center gap-0">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" ||
                  (!pathname.startsWith("/player") &&
                    !pathname.startsWith("/players") &&
                    !pathname.startsWith("/league") &&
                    !pathname.startsWith("/leagues") &&
                    !pathname.startsWith("/team"))
                : pathname === href || pathname.startsWith(href + "/")
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium transition-colors sm:px-4",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden text-[10px] font-semibold">{label}</span>
                {active && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full"
                    style={{ background: "linear-gradient(90deg, var(--brand-from), var(--brand-to))", boxShadow: "var(--glow-primary)" }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
