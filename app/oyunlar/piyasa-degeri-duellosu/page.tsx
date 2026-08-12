import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { MarketValueDuelGame } from "@/components/games/market-value-duel-game"

export const metadata = {
  title: "Piyasa Değeri Düellosu | ED Company",
  description: "İki futbolcudan hangisinin piyasa değeri daha yüksek? Sezgini test et.",
}

export default function MarketValueDuelPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto max-w-4xl px-5 py-6">
          <Link
            href="/oyunlar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Oyunlar
          </Link>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground">
            Piyasa Değeri Düellosu
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Hangisinin piyasa değeri daha yüksek? Kartına tıkla ve öğren.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        <MarketValueDuelGame />
      </main>
    </div>
  )
}
