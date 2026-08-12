import Link from "next/link"
import { ChevronLeft, Swords } from "lucide-react"
import { MarketValueDuelGame } from "@/components/games/market-value-duel-game"

export const metadata = {
  title: "Piyasa Değeri Düellosu | ED Company",
  description: "İki futbolcudan hangisinin piyasa değeri daha yüksek? Sezgini test et.",
}

export default function MarketValueDuelPage() {
  return (
    <div className="arena-scope arena-bg relative min-h-screen overflow-x-hidden">
      <div className="arena-spotlight" />

      <header className="relative z-10">
        <div className="mx-auto max-w-4xl px-5 py-6">
          <Link
            href="/oyunlar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Oyunlar
          </Link>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Swords className="h-5.5 w-5.5" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tight text-foreground">
                Piyasa Değeri <span className="text-primary">Düellosu</span>
              </h1>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                Değeri yüksek olanı seç. Seriyi bozma, arenayı domine et.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-5 py-6">
        <MarketValueDuelGame />
      </main>
    </div>
  )
}
