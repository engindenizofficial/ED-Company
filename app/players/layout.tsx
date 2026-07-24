import { ThemeToggle } from "@/components/theme-toggle"

export default function PlayersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-[49px] z-10 border-b border-border bg-background/95 backdrop-blur-md"
        style={{ boxShadow: "var(--shadow-nav)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-base font-extrabold text-foreground">Oyuncular</h1>
            <p className="text-xs text-muted-foreground">Oyuncu ara ve istatistiklerini incele</p>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  )
}
