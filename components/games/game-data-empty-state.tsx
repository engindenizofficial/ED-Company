import { DatabaseZap } from "lucide-react"

interface GameDataEmptyStateProps {
  title: string
  description: string
}

export function GameDataEmptyState({ title, description }: GameDataEmptyStateProps) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center justify-center px-4 py-12 sm:px-6">
      <section className="flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-12">
        <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <DatabaseZap className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          <p className="text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>
      </section>
    </main>
  )
}
