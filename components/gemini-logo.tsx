import { cn } from "@/lib/utils"

/**
 * Official Gemini "spark" mark rendered with its signature gradient.
 * Shown next to every prediction that was produced by Gemini.
 * Brand asset sourced from theSVG.org — review Google's trademark guidelines.
 */
export function GeminiLogo({ className }: { className?: string }) {
  // Unique gradient id per render location isn't required; a single shared
  // gradient definition is fine because the id is globally consistent.
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Gemini"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
    >
      <defs>
        <linearGradient id="gemini-spark" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="45%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-spark)"
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </svg>
  )
}

/** Small pill: Gemini logo + "Gemini" label. Used as a section attribution. */
export function GeminiBadge({ className, label = "Gemini" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      <GeminiLogo className="h-3 w-3" />
      {label}
    </span>
  )
}
