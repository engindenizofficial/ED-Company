"use client"

import { AnimatePresence } from "motion/react"
import { GoalCelebrationOverlay } from "@/components/goal-celebration-overlay"

interface GoalCelebrationLazyProps {
  celebration: { team: "home" | "away"; goalCount: number } | null
  currentKey: number | null
  fixtureId: number
  homeTeamName: string
  awayTeamName: string
  homeTeamLogo: string
  awayTeamLogo: string
  onDone: () => void
}

/** `AnimatePresence` + `GoalCelebrationOverlay`'i tek bir yerde toplayan
 * bileşen. Bu dosya "motion/react"i import ettiği için tüketiciler
 * (`fixture-list.tsx`, `analysis-panel.tsx`) bunu DOĞRUDAN import etmez;
 * `next/dynamic` ile `ssr: false` olarak talep üzerine yüklerler. Böylece
 * "motion" kütüphanesi, kutlama gerçekten gösterilmediği (maçların büyük
 * çoğunluğu için gerçek zamanlı gol olmadığı) sürece hiç indirilmez. */
export function GoalCelebrationLazy({
  celebration,
  currentKey,
  fixtureId,
  homeTeamName,
  awayTeamName,
  homeTeamLogo,
  awayTeamLogo,
  onDone,
}: GoalCelebrationLazyProps) {
  return (
    <AnimatePresence>
      {celebration ? (
        <GoalCelebrationOverlay
          key={currentKey}
          fixtureId={fixtureId}
          teamName={celebration.team === "home" ? homeTeamName : awayTeamName}
          teamLogo={celebration.team === "home" ? homeTeamLogo : awayTeamLogo}
          goalCount={celebration.goalCount}
          onDone={onDone}
        />
      ) : null}
    </AnimatePresence>
  )
}
