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
      className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur"
      aria-label="Ana navigasyon"
    >
      <div className="mx-auto flex max-w-4xl gap-0 px-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || (pathname !== "/players" && pathname !== "/leagues" && !pathname.startsWith("/player") && !pathname.startsWith("/league") && !pathname.startsWith("/team"))
              : pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
