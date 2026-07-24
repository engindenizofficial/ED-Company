"use client"

import { CalendarDays, Search, Trophy, Users } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/", label: "Canlı Sonuçlar", icon: CalendarDays },
  { href: "/players", label: "Oyuncular", icon: Users },
  { href: "/leagues", label: "Ligler", icon: Trophy },
]

export function NavTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <header className="sticky top-0 z-20" style={{ boxShadow: "var(--shadow-nav)" }}>
      {/* Top bar: logo + search + theme */}
      <div style={{ background: "var(--navy)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
          {/* Logo */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Ana sayfa"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-black text-white"
              style={{ background: "var(--orange)" }}
            >
              ED
            </span>
            <span className="hidden text-sm font-black tracking-tight text-white sm:block">
              ED<span style={{ color: "var(--orange)" }}>Analiz</span>
            </span>
          </Link>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex flex-1 max-w-sm items-center">
            <label className="relative flex w-full items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-white/60" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Takım, oyuncu, lig ara..."
                className="w-full rounded-md border border-white/20 bg-white/10 py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-white/50 outline-none transition focus:border-orange-400 focus:bg-white/15"
                aria-label="Ara"
              />
            </label>
          </form>

          <ThemeToggle />
        </div>
      </div>

      {/* Nav tabs row */}
      <nav
        className="bg-card border-b border-border"
        aria-label="Ana navigasyon"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-0 px-4">
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
                  "relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px",
                  active
                    ? "border-orange-500 text-orange-500"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
                style={active ? { borderBottomColor: "var(--orange)", color: "var(--orange)" } : {}}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:block">{label}</span>
                <span className="sm:hidden text-xs font-semibold">{label.split(" ")[0]}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </header>
  )
}
