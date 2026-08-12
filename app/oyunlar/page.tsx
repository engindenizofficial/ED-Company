import Link from "next/link"
import { Coins, Lock, Sparkles } from "lucide-react"

export const metadata = {
  title: "Oyunlar | ED Company",
  description: "Futbol bilginizi test edin: piyasa değeri düellosu ve daha fazlası.",
}

export default function GamesHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Bilgini Test Et
          </span>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">Oyunlar</h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Futbol dünyasına dair bilginizi ölçen mini oyunlar. İlk oyun: piyasa değeri sezgin ne
            kadar iyi?
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/oyunlar/piyasa-degeri-duellosu"
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-20 brand-gradient"
            />
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Coins className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">Piyasa Değeri Düellosu</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                İki futbolcudan hangisinin piyasa değeri daha yüksek? Sezgini test et, seriyi
                bozma.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Şimdi Oyna
            </div>
          </Link>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-dashed border-border/60 bg-card/40 p-5">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-muted-foreground">Yakında</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground/70">
                Yeni oyunlar üzerinde çalışıyoruz. Takipte kalın.
              </p>
            </div>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              Hazırlanıyor
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
