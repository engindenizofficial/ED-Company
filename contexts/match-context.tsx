"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { Fixture, MatchPrediction, PredictionResult } from "@/lib/types"

// Bkz. eski home-client.tsx: bir maçın tahmini yeniden üretilebilir mi
// (henüz oynanmadıysa) ve bir maç bitmiş mi (otomatik sonuç kaydı için).
const PREDICTABLE_STATUSES = new Set(["NS", "TBD", "PST"])
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"])

function actualWinner(homeGoals: number, awayGoals: number): "home" | "away" | "draw" {
  if (homeGoals > awayGoals) return "home"
  if (awayGoals > homeGoals) return "away"
  return "draw"
}

interface MatchPanelState {
  fixture: Fixture
  prediction: MatchPrediction | null
  predictionLoading: boolean
}

interface MatchContextValue {
  panel: MatchPanelState | null
  /**
   * Bir maçı açar. Zaten elimizde tam bir `Fixture` nesnesi varsa (örn. ana
   * sayfadaki fikstür listesinden tıklanmışsa) direkt onu kullanır; sadece
   * bir id verildiyse (başka bir panelden — takım/lig/H2H — veya /mac/[id]
   * URL'inden tıklanmışsa) `/api/fixtures/[id]` üzerinden tek başına çeker.
   */
  openMatch: (fixtureOrId: Fixture | { id: number }) => void
  closeMatch: () => void
  /**
   * Fikstür listesi 30 saniyede bir otomatik yenilendiğinde, o an açık olan
   * maç paneli (varsa) en güncel fixture nesnesiyle senkronize edilir —
   * bkz. eski home-client.tsx'teki aynı isimli effect.
   */
  syncFixture: (fixtures: Fixture[]) => void
  triggerPrediction: () => Promise<void>
  deletePrediction: () => Promise<void>
}

const MatchContext = createContext<MatchContextValue | null>(null)

function isFullFixture(value: Fixture | { id: number }): value is Fixture {
  return typeof (value as Fixture).home === "object" && (value as Fixture).home != null
}

export function MatchProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<MatchPanelState | null>(null)
  const requestIdRef = useRef(0)
  const openedFixtureIdRef = useRef<number | null>(null)
  // Hangi fixtureId'ler için sonuç zaten kaydedildi (çift kayıt önlemi) —
  // bkz. eski home-client.tsx'teki aynı isimli ref.
  const savedResultIds = useRef<Set<number>>(new Set())

  const loadPrediction = useCallback(async (fixtureId: number, requestId: number) => {
    try {
      const res = await fetch(`/api/predict/cached?fixtureId=${fixtureId}`, { cache: "no-store" })
      const data: MatchPrediction | null = res.ok ? ((await res.json()) as MatchPrediction) : null
      if (requestId !== requestIdRef.current) return
      setPanel((prev) => (prev && prev.fixture.id === fixtureId ? { ...prev, prediction: data, predictionLoading: false } : prev))
    } catch {
      if (requestId !== requestIdRef.current) return
      setPanel((prev) => (prev && prev.fixture.id === fixtureId ? { ...prev, prediction: null, predictionLoading: false } : prev))
    }
  }, [])

  const openMatch = useCallback((fixtureOrId: Fixture | { id: number }) => {
    const requestId = ++requestIdRef.current

    if (isFullFixture(fixtureOrId)) {
      openedFixtureIdRef.current = fixtureOrId.id
      setPanel({ fixture: fixtureOrId, prediction: null, predictionLoading: true })
      loadPrediction(fixtureOrId.id, requestId)
      return
    }

    // Sadece id verildi — tek başına çek.
    const fixtureId = fixtureOrId.id
    openedFixtureIdRef.current = fixtureId
    setPanel((prev) => (prev?.fixture.id === fixtureId ? prev : null))
    fetch(`/api/fixtures/${fixtureId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Fixture>) : null))
      .then((fixture) => {
        if (requestId !== requestIdRef.current || !fixture) return
        setPanel({ fixture, prediction: null, predictionLoading: true })
        loadPrediction(fixture.id, requestId)
      })
      .catch(() => {})
  }, [loadPrediction])

  const closeMatch = useCallback(() => {
    requestIdRef.current++
    openedFixtureIdRef.current = null
    setPanel(null)
  }, [])

  const syncFixture = useCallback((fixtures: Fixture[]) => {
    setPanel((prev) => {
      if (!prev) return prev
      const updated = fixtures.find((f) => f.id === prev.fixture.id)
      if (!updated) return prev
      return { ...prev, fixture: updated }
    })
  }, [])

  const triggerPrediction = useCallback(async () => {
    const fixture = panel?.fixture
    if (!fixture) return
    const requestId = ++requestIdRef.current
    setPanel((prev) => (prev ? { ...prev, predictionLoading: true, prediction: null } : prev))
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: fixture.id }),
        cache: "no-store",
      })
      if (!res.ok) throw new Error("Tahmin alınamadı")
      const data = (await res.json()) as MatchPrediction
      if (requestId !== requestIdRef.current) return
      setPanel((prev) => (prev && prev.fixture.id === fixture.id ? { ...prev, prediction: data, predictionLoading: false } : prev))
    } catch {
      if (requestId !== requestIdRef.current) return
      setPanel((prev) => (prev && prev.fixture.id === fixture.id ? { ...prev, prediction: null, predictionLoading: false } : prev))
    }
  }, [panel])

  const deletePrediction = useCallback(async () => {
    const fixture = panel?.fixture
    if (!fixture) return
    const res = await fetch(`/api/predict?fixtureId=${fixture.id}`, {
      method: "DELETE",
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Tahmin silinemedi")
    setPanel((prev) => (prev && prev.fixture.id === fixture.id ? { ...prev, prediction: null } : prev))
    savedResultIds.current.delete(fixture.id)
  }, [panel])

  // Tahmin hazır olduğunda, bitmiş maçlar için otomatik sonuç kaydet — bkz.
  // eski home-client.tsx'teki aynı isimli effect.
  useEffect(() => {
    if (!panel || panel.predictionLoading) return
    const { fixture, prediction } = panel
    if (!prediction) return
    if (!FINISHED_STATUSES.has(fixture.statusShort)) return
    if (savedResultIds.current.has(fixture.id)) return

    const homeGoals = fixture.goalsHome
    const awayGoals = fixture.goalsAway
    if (homeGoals == null || awayGoals == null) return

    const winner = actualWinner(homeGoals, awayGoals)

    fetch("/api/prediction-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId: fixture.id,
        homeName: fixture.home.name,
        awayName: fixture.away.name,
        predictedHome: prediction.homeScore,
        predictedAway: prediction.awayScore,
        predictedWinner: prediction.winner,
        actualHome: homeGoals,
        actualAway: awayGoals,
        actualWinner: winner,
        confidence: prediction.confidence,
        modelVotes: prediction.modelVotes ?? [],
      }),
      cache: "no-store",
    })
      .then((res) => {
        if (res.ok) savedResultIds.current.add(fixture.id)
      })
      .catch(() => {})
  }, [panel])

  return (
    <MatchContext.Provider
      value={{ panel, openMatch, closeMatch, syncFixture, triggerPrediction, deletePrediction }}
    >
      {children}
    </MatchContext.Provider>
  )
}

export function useMatchPanel(): MatchContextValue {
  const ctx = useContext(MatchContext)
  if (!ctx) throw new Error("useMatchPanel must be used within MatchProvider")
  return ctx
}

export type { PredictionResult }
