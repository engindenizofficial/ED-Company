"use client"

import { useEffect, useState } from "react"
import { Loader2, Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/contexts/language-context"
import { formatMarketValueEur } from "@/lib/market-value-format"
import type { PlayerRole } from "@/lib/games/manager-career"
import type { ManagerPlayerSearchResult } from "@/app/api/games/manager-career/players/search/route"
import { PowerBadge } from "@/components/games/manager-career/power-badge"
import { hasVerifiedPosition, positionSummary, ratingAtPosition, fit, positionLabel, type PlayerPosition } from "@/lib/player-positions"

const ROLE_LABEL_KEY: Record<PlayerRole, string> = {
  Goalkeeper: "goalkeeper",
  Defender: "defender",
  Midfielder: "midfielder",
  Attacker: "attacker",
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

interface PlayerSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null → herhangi bir mevkiden oyuncu (yedek seçimi). */
  role: PlayerRole | null
  /** Sahadaki hedef slotun spesifik mevkisi (örn. "LB") — verildiğinde reyting bu slota göre uyarlanır ve sonuçlar buna göre sıralanır. Yedek seçiminde null. */
  targetPosition?: PlayerPosition | null
  budgetRemainingEur: number
  excludePlayerIds: Set<number>
  onSelect: (result: ManagerPlayerSearchResult) => void
}

export function PlayerSearchDialog({
  open,
  onOpenChange,
  role,
  targetPosition = null,
  budgetRemainingEur,
  excludePlayerIds,
  onSelect,
}: PlayerSearchDialogProps) {
  const { t, locale } = useLanguage()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ManagerPlayerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debouncedQuery = useDebounce(query, 320)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ q: debouncedQuery.trim() })
    if (role) params.set("role", role)
    fetch(`/api/games/manager-career/players/search?${params}`)
      .then((r) => r.json())
      .then((data: { results: ManagerPlayerSearchResult[] }) => {
        if (!cancelled) setResults(data.results ?? [])
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, role])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md gap-3 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {role ? t("managerCareer.searchPlaceholderForRole", { role: t(`managerCareer.${ROLE_LABEL_KEY[role]}`) }) : t("managerCareer.searchTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("managerCareer.searchTitle")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={role ? t("managerCareer.searchPlaceholderForRole", { role: t(`managerCareer.${ROLE_LABEL_KEY[role]}`) }) : t("managerCareer.searchPlaceholderBench")}
            className="pl-9"
          />
        </div>

        <div className="flex max-h-[55vh] flex-col overflow-y-auto">
          {debouncedQuery.trim().length < 2 && !loading && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t("managerCareer.searchMinChars")}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("managerCareer.searchLoading")}
            </div>
          )}

          {!loading && debouncedQuery.trim().length >= 2 && results.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t("managerCareer.searchNoResults")}</p>
          )}

          {!loading &&
            [...results]
              // Hedef bir slot varsa, o slota en uyumlu oyuncular üstte listelenir
              // (bkz. lib/player-positions.ts fit()) — ham güç puanına göre değil.
              .sort((a, b) => {
                if (!targetPosition) return 0
                const fitDiff = fit(b.position, targetPosition) - fit(a.position, targetPosition)
                if (fitDiff !== 0) return fitDiff
                return (b.power ?? 0) - (a.power ?? 0)
              })
              .map((r) => {
                const alreadySelected = excludePlayerIds.has(r.id)
                const insufficientBudget = r.priceEur > budgetRemainingEur
                const disabled = alreadySelected || insufficientBudget
                const fitRatio = targetPosition ? fit(r.position, targetPosition) : 1
                const adjustedPower = targetPosition && r.power !== null ? ratingAtPosition(r.power, r.position, targetPosition) : r.power
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(r)}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                      {r.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                          {r.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                        <PowerBadge power={adjustedPower} />
                        {hasVerifiedPosition(r.position) && (
                          <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                            {positionSummary(r.position)}
                          </span>
                        )}
                        {targetPosition && fitRatio < 1 && (
                          <span
                            title={`${positionLabel(targetPosition)} için tam mevkisi değil`}
                            className={
                              "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide " +
                              (fitRatio >= 0.85 ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive")
                            }
                          >
                            {fitRatio >= 0.85 ? "Yakın mevki" : "Uyumsuz mevki"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r.teamLogo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.teamLogo}
                            alt=""
                            className="h-3.5 w-3.5 shrink-0 rounded-[2px] bg-white object-contain ring-1 ring-black/10"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate text-[11px] text-muted-foreground">
                          {r.teamName ?? t("duel.unknown")}
                          {r.age ? ` · ${r.age}` : ""}
                        </span>
                      </div>
                    </div>
                    <span
                      className={
                        "shrink-0 text-xs font-bold tabular-nums " +
                        (insufficientBudget ? "text-destructive" : "text-emerald-500")
                      }
                    >
                      {formatMarketValueEur(r.priceEur, locale) ?? "-"}
                    </span>
                  </button>
                )
              })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
