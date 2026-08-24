"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { getTeamAccentColor } from "@/lib/team-color"
import { useLanguage } from "@/contexts/language-context"

// Tam 5 saniyelik, sadece ilgili maç kartını kaplayan gol kutlama animasyonu.
// Tam ekran DEĞİL — kartın kendi rounded-xl sınırları içinde kalır. Takıma
// özgü his, logodan otomatik çıkarılan baskın renkten (lib/team-color.ts)
// geliyor; elle hiçbir takım için renk tanımlamadan her takım kendi rengini
// alıyor.
const DURATION_MS = 5000
const PARTICLE_COUNT = 22

interface GoalCelebrationOverlayProps {
  teamName: string
  teamLogo: string
  onDone: () => void
}

export function GoalCelebrationOverlay({ teamName, teamLogo, onDone }: GoalCelebrationOverlayProps) {
  const { t } = useLanguage()
  const [color, setColor] = useState("hsl(var(--primary))")

  useEffect(() => {
    let active = true
    getTeamAccentColor(teamLogo).then((resolved) => {
      if (active) setColor(resolved)
    })
    return () => {
      active = false
    }
  }, [teamLogo])

  useEffect(() => {
    const timeout = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(timeout)
    // onDone kimliği her render'da değişmeyecek şekilde çağıran taraf useCallback
    // benzeri bir referansla veriyor; burada sadece ilk mount'ta zamanlayıcı kuruyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 2) * 0.25
    const distance = 70 + (i % 5) * 26
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: (i % 7) * 0.06,
      size: 4 + (i % 3) * 2,
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-xl pointer-events-none"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {/* Metnin her renk üzerinde okunabilir kalması için karartma katmanı */}
      <div className="absolute inset-0 bg-black/30" />

      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full bg-white"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center gap-1.5 px-3">
        <motion.div
          initial={{ scale: 0, rotate: -18 }}
          animate={{ scale: [0, 1.18, 1], rotate: 0 }}
          transition={{ duration: 0.55, ease: "backOut" }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamLogo || "/placeholder.svg"} alt="" className="h-8 w-8 object-contain" />
        </motion.div>
        <motion.span
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="text-xs font-black uppercase tracking-wide text-white drop-shadow-sm"
        >
          {t("goalCelebration.title")}
        </motion.span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="max-w-[200px] truncate text-center text-[11px] font-semibold text-white/90"
        >
          {teamName}
        </motion.span>
      </div>
    </motion.div>
  )
}
