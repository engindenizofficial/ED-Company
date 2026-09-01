import { cn } from "@/lib/utils"

/**
 * Oyuncu güç motorunun (bkz. lib/player-power.ts) ürettiği 1-99 puanı küçük
 * bir rozet olarak gösterir. Eşikler: >=80 yüksek (yeşil), >=65 orta (mavi),
 * altı düşük (nötr gri) — kadro kurma ekranındaki oyuncu kartlarında
 * kullanılır (arama listesi, saha slotu, yedek slotu).
 */
export function PowerBadge({ power, className }: { power: number | null; className?: string }) {
  if (power === null) return null

  const tier: "high" | "mid" | "low" = power >= 80 ? "high" : power >= 65 ? "mid" : "low"
  const tierClasses: Record<typeof tier, string> = {
    high: "bg-emerald-500 text-white",
    mid: "bg-sky-500 text-white",
    low: "bg-muted text-muted-foreground",
  }

  return (
    <span
      className={cn(
        "inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none tabular-nums shadow-sm ring-1 ring-background",
        tierClasses[tier],
        className,
      )}
    >
      {power}
    </span>
  )
}
