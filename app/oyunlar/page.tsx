import { Gamepad2 } from "lucide-react"

export default function OyunlarPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col items-center px-5 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
        <Gamepad2 className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mt-6 text-2xl font-black tracking-tight text-foreground">Oyunlar</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Yakında burada eğlenceli oyunlar olacak. Bir sonraki adımda ilk oyunu birlikte ekleyeceğiz.
      </p>
    </main>
  )
}
