"use client"

import { AnimatePresence, motion } from "motion/react"
import { Check, MapPin, Shield, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMarketValueEur } from "@/lib/market-value-format"
import type { DuelPlayer } from "@/lib/games/market-value-duel"

interface DuelPlayerCardProps {
  player: DuelPlayer
  side: "left" | "right"
  revealed: boolean
  value: number | null
  isCorrect: boolean | null
  isPicked: boolean
  disabled: boolean
  onPick: () => void
}

export function DuelPlayerCard({
  player,
  side,
  revealed,
  value,
  isCorrect,
  isPicked,
  disabled,
  onPick,
}: DuelPlayerCardProps) {
  const formattedValue = formatMarketValueEur(value)

  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={disabled}
      initial={{ opacity: 0, x: side === "left" ? -24 : 24, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!disabled ? { y: -4 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={cn(
        "group relative flex w-full flex-col items-center overflow-hidden rounded-3xl border bg-card px-5 pb-6 pt-8 text-center transition-colors",
        !revealed && "border-border/60 hover:border-primary/50",
        revealed && isCorrect && "border-primary/70",
        revealed && isCorrect === false && "border-destructive/50",
        disabled && !revealed && "cursor-default",
      )}
    >
      {/* Sonuç durumuna göre arka plan parıltısı */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "pointer-events-none absolute inset-0",
              isCorrect
                ? "bg-gradient-to-b from-primary/10 via-transparent to-transparent"
                : "bg-gradient-to-b from-destructive/10 via-transparent to-transparent",
            )}
          />
        )}
      </AnimatePresence>

      {/* Doğru/yanlış rozeti */}
      <AnimatePresence>
        {revealed && isPicked && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
            className={cn(
              "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full",
              isCorrect ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground",
            )}
          >
            {isCorrect ? <Check className="h-4.5 w-4.5" /> : <X className="h-4.5 w-4.5" />}
          </motion.div>
        )}
      </AnimatePresence>

      {revealed && !isPicked && isCorrect !== null && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.25 }}
          className="absolute left-3 top-3 z-10 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary"
        >
          Doğru cevap
        </motion.div>
      )}

      {/* Fotoğraf */}
      <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-secondary ring-4 ring-background">
        {player.photo ? (
          <img
            src={player.photo || "/placeholder.svg"}
            alt={player.name}
            crossOrigin="anonymous"
            className="h-full w-full object-cover"
          />
        ) : (
          <Shield className="h-10 w-10 text-muted-foreground" />
        )}
      </div>

      {/* İsim */}
      <h3 className="mt-4 text-balance text-lg font-bold leading-tight text-foreground">
        {player.name}
      </h3>

      {/* Takım */}
      {player.team && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {player.team.logo && (
            <img
              src={player.team.logo || "/placeholder.svg"}
              alt=""
              crossOrigin="anonymous"
              className="h-4 w-4 object-contain"
            />
          )}
          <span>{player.team.name}</span>
        </div>
      )}

      {/* Ülke */}
      {player.country && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
          <MapPin className="h-3 w-3" />
          <span>{player.country}</span>
        </div>
      )}

      {/* Piyasa değeri alanı — animasyonla açığa çıkar */}
      <div className="mt-5 flex h-12 w-full items-center justify-center">
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="hidden"
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              ??? €
            </motion.div>
          ) : (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "rounded-full px-4 py-1.5 text-lg font-black tabular-nums",
                isCorrect ? "text-primary" : "text-foreground",
              )}
            >
              {formattedValue ?? "Bilinmiyor"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}
