"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { getTeamAccentColor } from "@/lib/team-color"
import { useLanguage } from "@/contexts/language-context"

/** Bir maçta gol olduğunda 5 saniyeliğine gösterilecek kutlama kuyruğunu
 * yönetir. Aynı anda hem ev hem konuk gol atarsa (nadir de olsa), ikisi üst
 * üste binmeden sırayla gösterilir. Hem ana sayfadaki maç kartında
 * (fixture-list.tsx) hem de maç panelinin başlığında (analysis-panel.tsx)
 * kullanılır. */
let celebrationKeySeq = 0

export function useGoalCelebrationQueue(goalsHome: number | null, goalsAway: number | null) {
  const prevRef = useRef<{ home: number | null; away: number | null }>({
    home: goalsHome,
    away: goalsAway,
  })
  const [queue, setQueue] = useState<Array<{ team: "home" | "away"; key: number }>>([])

  useEffect(() => {
    const prev = prevRef.current
    const additions: Array<{ team: "home" | "away"; key: number }> = []
    if (prev.home !== null && goalsHome !== null && goalsHome > prev.home) {
      additions.push({ team: "home", key: celebrationKeySeq++ })
    }
    if (prev.away !== null && goalsAway !== null && goalsAway > prev.away) {
      additions.push({ team: "away", key: celebrationKeySeq++ })
    }
    if (additions.length > 0) {
      setQueue((q) => [...q, ...additions])
    }
    prevRef.current = { home: goalsHome, away: goalsAway }
  }, [goalsHome, goalsAway])

  const current = queue[0] ?? null
  const advance = () => setQueue((q) => q.slice(1))
  // Gerçek bir gol beklemeden animasyonu test edebilmek için: skor değişimi
  // olmadan da kuyruğa elle bir kutlama ekler. Sadece geliştirme/test amaçlı.
  const simulate = (team: "home" | "away") => setQueue((q) => [...q, { team, key: celebrationKeySeq++ }])

  return { current, currentKey: current?.key ?? null, advance, simulate }
}

// Tam 5 saniyelik, sadece ilgili maç kartını kaplayan gol kutlama animasyonu.
// Tam ekran DEĞİL — kartın kendi rounded-xl sınırları içinde kalır. Kart
// genelde geniş ve alçak (yatay) olduğu için içerik de yatay bir şerit
// düzeninde kuruludur: sol tarafta takım logosu, ortada "GOL!" + takım adı,
// sağ tarafta (bulunabilirse) golü atan oyuncunun fotoğrafı ve adı. Takıma
// özgü his, logodan otomatik çıkarılan baskın renkten (lib/team-color.ts)
// geliyor; elle hiçbir takım için renk tanımlamadan her takım kendi rengini
// alıyor.
const DURATION_MS = 5000
const PARTICLE_COUNT = 26

interface Scorer {
  name: string
  photoUrl: string | null
}

interface GoalCelebrationOverlayProps {
  fixtureId: number
  teamName: string
  teamLogo: string
  onDone: () => void
}

export function GoalCelebrationOverlay({ fixtureId, teamName, teamLogo, onDone }: GoalCelebrationOverlayProps) {
  const { t } = useLanguage()
  const [color, setColor] = useState("hsl(var(--primary))")
  const [scorer, setScorer] = useState<Scorer | null>(null)

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
    let active = true
    fetch(`/api/fixtures/${fixtureId}/goal-scorer`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { goals?: Array<{ team: string; player: string | null; playerId: number | null }> } | null) => {
        if (!active || !data?.goals?.length) return
        // Bu takımın attığı gollerden en sonuncusu (dakikaya göre en yüksek) —
        // yani az önce ekranda gördüğümüz gol.
        const teamGoals = data.goals.filter((g) => g.team === teamName && g.player)
        const last = teamGoals[teamGoals.length - 1]
        if (last?.player) {
          setScorer({
            name: last.player,
            photoUrl: last.playerId ? `https://media.api-sports.io/football/players/${last.playerId}.png` : null,
          })
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // fixtureId ve teamName bu overlay'in ömrü boyunca sabittir (her gol için
    // yeni bir key ile yeniden mount edilir), tek seferlik fetch yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timeout = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(timeout)
    // onDone kimliği her render'da değişmeyecek şekilde çağıran taraf useCallback
    // benzeri bir referansla veriyor; burada sadece ilk mount'ta zamanlayıcı kuruyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Parçacıklar geniş/alçak kart alanına yayılacak şekilde daha çok yatayda,
  // az dikeyde saçılıyor (radyal patlama yerine yatay bir "şerit" hissi).
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const spread = (i / (PARTICLE_COUNT - 1)) * 2 - 1 // -1..1
    return {
      x: spread * 220 + (i % 2 === 0 ? -12 : 12),
      y: -18 - (i % 4) * 14,
      delay: (i % 8) * 0.05,
      size: 4 + (i % 3) * 2,
      driftX: spread * 60,
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex items-center overflow-hidden rounded-xl pointer-events-none"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {/* Metnin her renk üzerinde okunabilir kalması için karartma katmanı */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Sol taraftan sağa kayan ışık huzmesi — "canlı yayın grafiği" hissi */}
      <motion.div
        className="absolute inset-y-0 w-1/3 skew-x-[-20deg] bg-white/15"
        initial={{ x: "-120%" }}
        animate={{ x: "320%" }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.15 }}
      />

      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full bg-white"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{ x: [0, p.driftX, p.x], y: [0, p.y, p.y + 46], opacity: [1, 1, 0], scale: [0, 1, 1] }}
          transition={{ duration: 1.3, delay: p.delay, ease: "easeOut" }}
        />
      ))}

      {/* Yatay içerik şeridi: logo — GOL!/takım adı — golcü */}
      <div className="relative z-10 flex w-full items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={{ scale: 0, rotate: -18 }}
            animate={{ scale: [0, 1.2, 1], rotate: 0 }}
            transition={{ duration: 0.55, ease: "backOut" }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={teamLogo || "/placeholder.svg"} alt="" className="h-9 w-9 object-contain" />
          </motion.div>
          <div className="flex min-w-0 flex-col">
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
              className="text-base font-black uppercase leading-none tracking-wide text-white drop-shadow-sm"
            >
              {t("goalCelebration.title")}
            </motion.span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.35 }}
              className="max-w-[160px] truncate text-xs font-semibold text-white/90"
            >
              {teamName}
            </motion.span>
          </div>
        </div>

        {/* Golcü bilgisi geldiğinde sağdan kayarak beliriyor */}
        {scorer ? (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-full bg-black/25 pl-2.5 pr-3.5 py-1.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 ring-2 ring-white/70">
              {scorer.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scorer.photoUrl || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white">{scorer.name.charAt(0)}</span>
              )}
            </div>
            <span className="max-w-[140px] truncate text-sm font-bold text-white drop-shadow-sm">{scorer.name}</span>
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  )
}
