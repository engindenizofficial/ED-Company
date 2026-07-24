import { ThemeToggle } from "@/components/theme-toggle"

export default function LeaguesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-[49px] z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-extrabold leading-none tracking-tight">
            <span className="brand-gradient bg-clip-text text-transparent">ED</span>{" "}
            <span className="text-foreground">Ligler</span>
          </h1>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  )
}
