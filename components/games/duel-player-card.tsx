"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Calendar, Check, MapPin, Shield, Shirt, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMarketValueEur } from "@/lib/market-value-format"
import { useLanguage } from "@/contexts/language-context"
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
  const { t } = useLanguage()
  const formattedValue = formatMarketValueEur(value)
  const [photoFailed, setPhotoFailed] = useState(false)
  const showPhoto = Boolean(player.photo) && !photoFailed

  const POS_LABEL: Record<string, string> = {
    Goalkeeper: t("team.goalkeeper"),
    Defender: t("team.defender"),
    Midfielder: t("team.midfielder"),
    Attacker: t("team.attacker"),
  }

  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={disabled}
      initial={{ opacity: 0, x: side === "left" ? -36 : 36, y: 16, rotate: side === "left" ? -2 : 2 }}
      animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!disabled ? { y: -6, scale: 1.015 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={cn(
        "group relative flex w-full flex-col items-center overflow-hidden rounded-3xl border bg-card px-5 pb-6 pt-9 text-center transition-all duration-300",
        !revealed &&
          "border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_40px_-20px_rgba(0,0,0,0.6)] hover:border-primary/60 hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_50%,transparent),0_0_36px_-8px_var(--primary)]",
        revealed && isCorrect && "border-primary shadow-[0_0_0_1px_var(--primary),0_0_50px_-12px_var(--primary)]",
        revealed && isCorrect === false && "border-destructive/60 shadow-[0_0_0_1px_color-mix(in_oklch,var(--destructive)_60%,transparent)]",
        disabled && !revealed && "cursor-default",
      )}
    >
      {/* Üstten dramatik ışık huzmesi */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          !revealed && "bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_75%)]",
        )}
      />

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
                ? "bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--primary)_20%,transparent),transparent_70%)]"
                : "bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--destructive)_16%,transparent),transparent_70%)]",
            )}
          />
        )}
      </AnimatePresence>

      {/* Köşe kesikli aksan çizgisi */}
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r transition-opacity",
          revealed && isCorrect ? "from-primary via-primary to-transparent opacity-100" : "opacity-0",
        )}
      />

      {/* Doğru/yanlış rozeti */}
      <AnimatePresence>
        {revealed && isPicked && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.1 }}
            className={cn(
              "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-background",
              isCorrect
                ? "bg-primary text-primary-foreground shadow-[0_0_18px_-2px_var(--primary)]"
                : "bg-destructive text-destructive-foreground shadow-[0_0_18px_-2px_var(--destructive)]",
            )}
          >
            {isCorrect ? <Check className="h-5 w-5" strokeWidth={3} /> : <X className="h-5 w-5" strokeWidth={3} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fotoğraf */}
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div
          className={cn(
            "absolute inset-0 rounded-full opacity-0 blur-md transition-opacity duration-500",
            revealed && isCorrect && "opacity-70 bg-primary/50",
            !revealed && "group-hover:opacity-40 bg-primary/40",
          )}
        />
        <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-secondary ring-4 ring-background">
          {showPhoto ? (
            <img
              src={player.photo || "/placeholder.svg"}
              alt={player.name}
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
              width={112}
              height={112}
              decoding="async"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Shield className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* İsim */}
      <h3 className="mt-4 text-balance text-lg font-black uppercase italic leading-tight tracking-tight text-foreground">
        {player.name}
      </h3>

      {/* Takım */}
      {player.team && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {player.team.logo && (
            <img
              src={player.team.logo || "/placeholder.svg"}
              alt=""
              crossOrigin="anonymous"
              className="h-4 w-4 object-contain rounded-full bg-white/95 p-0.5 ring-1 ring-black/5"
              width={16}
              height={16}
              loading="lazy"
              decoding="async"
            />
          )}
          <span>{player.team.name}</span>
        </div>
      )}

      {/* Ülke */}
      {player.country && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/90">
          <MapPin className="h-3 w-3" />
          <span>{player.country}</span>
        </div>
      )}

      {/* Yaş & Mevki */}
      {(player.age != null || player.position) && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground/90">
          {player.age != null && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {player.age}
            </span>
          )}
          {player.age != null && player.position && <span className="text-border">·</span>}
          {player.position && (
            <span className="flex items-center gap-1">
              <Shirt className="h-3 w-3" />
              {POS_LABEL[player.position] ?? player.position}
            </span>
          )}
        </div>
      )}

      {/* Piyasa değeri alanı — animasyonla açığa çıkar */}
      <div className="mt-5 flex h-12 w-full items-center justify-center">
        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="hidden"
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 rounded-full border border-dashed border-white/15 bg-white/[0.02] px-4 py-1.5 text-xs font-black uppercase tracking-wide text-muted-foreground"
            >
              {t("duel.hiddenValue")}
            </motion.div>
          ) : (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 14, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              className={cn(
                "rounded-full px-5 py-1.5 text-xl font-black italic tabular-nums",
                isCorrect ? "text-primary drop-shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_60%,transparent)]" : "text-foreground",
              )}
            >
              {formattedValue ?? t("duel.unknown")}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}
