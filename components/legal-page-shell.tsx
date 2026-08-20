import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

export function LegalPageShell({
  title,
  updatedLabel,
  children,
}: {
  title: string
  updatedLabel?: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
      <Link
        href="/"
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ana sayfaya dön
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">{title}</h1>
        {updatedLabel && <p className="text-xs text-muted-foreground">{updatedLabel}</p>}
      </div>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:leading-relaxed [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
        {children}
      </div>
    </main>
  )
}
