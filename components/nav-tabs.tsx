"use client"

import { CalendarDays } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/", label: "Maçlar", icon: CalendarDays },
]

export function NavTabs() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md"
      aria-label="Ana navigasyon"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5">
        {/* Logo sol */}
        <span className="select-none text-[13px] font-black tracking-[0.18em] uppercase">
          <span className="brand-gradient bg-clip-text text-transparent">ED</span>
          <span className="text-foreground/30 mx-1">/</span>
          <span className="text-foreground/60 font-semibold tracking-widest text-[11px]">ANALYTICS</span>
        </span>

        {/* Tabs */}
        <div className="flex gap-0">
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
        </div>
      </div>
    </nav>
  )
}
