"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { Fixture, MatchPrediction, PredictionResult } from "@/lib/types"
import { usePanelSeq } from "@/contexts/panel-stack-context"

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
  /** Bu panel örneğine açıldığı anda atanan, diğer panel türleriyle
   * karşılaştırılabilir global sıra numarası — doğru z-index için kullanılır.
   * Bkz. contexts/panel-stack-context.tsx. */
  seq: number
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
   * Maç paneli türünün açık olduğu TÜM seviyeleri (bir maçın H2H sekmesinden
   * başka bir maça geçilmiş olabilir) tek seferde kapatır. `closeMatch`
   * sadece en üstteki seviyeyi kapatıp altında kalanı ortaya çıkarırken, bu
   * tamamen sıfırlar — bkz. PanelRouteGuard.
   */
  closeAllMatch: () => void
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
  // Bir maç paneli içinden (örn. H2H sekmesindeki başka bir maç satırı)
  // başka bir maç paneli açılabiliyor. Tek bir `panel` slotu kullanmak,
  // ikinci maç açıldığında ilkinin verisini tamamen kaybettiriyordu — bu
  // yüzden bir YIĞIN (stack) tutuyoruz: her açılış üste bir girdi ekler,
  // `closeMatch` sadece en üsttekini kaldırır ve altındaki (verisi hâlâ
  // elimizde olan) panel anında geri görünür olur.
  const [stack, setStack] = useState<MatchPanelState[]>([])
  const nextSeq = usePanelSeq()
  const requestIdRef = useRef(0)
  const openedFixtureIdRef = useRef<number | null>(null)
  // Hangi fixtureId'ler için sonuç zaten kaydedildi (çift kayıt önlemi) —
  // bkz. eski home-client.tsx'teki aynı isimli ref.
  const savedResultIds = useRef<Set<number>>(new Set())

  // Tahmin oluşturma /api/predict tarafında artık arka planda (after()) sürüyor
  // ve HTTP isteği hemen 202 "processing" ile dönüyor — bkz. app/api/predict/route.ts.
  // Bu yüzden hazır sonucu almak için /api/predict/cached'i periyodik olarak
  // (poll) kontrol ediyoruz. Panelden çıkıp tekrar girildiğinde de aynı poll
  // devam eder: sunucudaki iş kesilmediği için süreç sıfırdan başlamaz, sadece
  // hâlâ hazırlanıyorsa beklenir, hazırsa anında gösterilir.
  const POLL_INTERVAL_MS = 3000
  const POLL_MAX_ATTEMPTS = 100 // ~5 dakika güvenlik sınırı

  const pollPrediction = useCallback((fixtureId: number, requestId: number, attempt = 0) => {
    fetch(`/api/predict/cached?fixtureId=${fixtureId}`, { cache: "no-store" })
      .then(async (res) => {
        if (requestId !== requestIdRef.current) return

        if (res.status === 202) {
          // Hâlâ hazırlanıyor — bir süre sonra tekrar dene
          if (attempt >= POLL_MAX_ATTEMPTS) {
            setStack((prev) => prev.map((entry) => (entry.fixture.id === fixtureId ? { ...entry, prediction: null, predictionLoading: false } : entry)))
            return
          }
          setTimeout(() => pollPrediction(fixtureId, requestId, attempt + 1), POLL_INTERVAL_MS)
          return
        }

        const data: MatchPrediction | null = res.ok ? ((await res.json()) as MatchPrediction) : null
        setStack((prev) => prev.map((entry) => (entry.fixture.id === fixtureId ? { ...entry, prediction: data, predictionLoading: false } : entry)))
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setStack((prev) => prev.map((entry) => (entry.fixture.id === fixtureId ? { ...entry, prediction: null, predictionLoading: false } : entry)))
      })
  }, [])

  const loadPrediction = useCallback((fixtureId: number, requestId: number) => {
    pollPrediction(fixtureId, requestId)
  }, [pollPrediction])

  const openMatch = useCallback((fixtureOrId: Fixture | { id: number }) => {
    const requestId = ++requestIdRef.current

    const pushOrUpdate = (fixture: Fixture) => {
      setStack((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].fixture.id === fixture.id) {
          const next: MatchPanelState = { fixture, prediction: null, predictionLoading: true, seq: prev[prev.length - 1].seq }
          return [...prev.slice(0, -1), next]
        }
        const next: MatchPanelState = { fixture, prediction: null, predictionLoading: true, seq: nextSeq() }
        return [...prev, next]
      })
    }

    if (isFullFixture(fixtureOrId)) {
      openedFixtureIdRef.current = fixtureOrId.id
      pushOrUpdate(fixtureOrId)
      loadPrediction(fixtureOrId.id, requestId)
      return
    }

    // Sadece id verildi — tek başına çek. Fetch bitene kadar mevcut yığına
    // dokunmuyoruz (böylece altta açık olan panelleri gizlemiyoruz).
    const fixtureId = fixtureOrId.id
    openedFixtureIdRef.current = fixtureId
    fetch(`/api/fixtures/${fixtureId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Fixture>) : null))
      .then((fixture) => {
        if (requestId !== requestIdRef.current || !fixture) return
        pushOrUpdate(fixture)
        loadPrediction(fixture.id, requestId)
      })
      .catch(() => {})
  }, [loadPrediction])

  const closeMatch = useCallback(() => {
    requestIdRef.current++
    openedFixtureIdRef.current = null
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const closeAllMatch = useCallback(() => {
    requestIdRef.current++
    openedFixtureIdRef.current = null
    setStack([])
  }, [])

  const syncFixture = useCallback((fixtures: Fixture[]) => {
    setStack((prev) => {
      if (prev.length === 0) return prev
      let changed = false
      const next = prev.map((entry) => {
        const updated = fixtures.find((f) => f.id === entry.fixture.id)
        if (!updated) return entry
        changed = true
        return { ...entry, fixture: updated }
      })
      return changed ? next : prev
    })
  }, [])

  const panel = stack.length > 0 ? stack[stack.length - 1] : null

  const triggerPrediction = useCallback(async () => {
    const fixture = panel?.fixture
    if (!fixture) return
    const requestId = ++requestIdRef.current
    setStack((prev) => prev.map((entry) => (entry.fixture.id === fixture.id ? { ...entry, predictionLoading: true, prediction: null } : entry)))
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: fixture.id }),
        cache: "no-store",
      })
      if (!res.ok && res.status !== 202) throw new Error("Tahmin alınamadı")
      if (requestId !== requestIdRef.current) return

      if (res.status === 202) {
        // İş sunucu tarafında arka planda başladı (veya zaten sürüyor) — hazır
        // olana kadar poll ile bekle. Bu istek burada bitse (kullanıcı paneli
        // kapatsa) bile sunucudaki iş kesilmez, bkz. app/api/predict/route.ts.
        pollPrediction(fixture.id, requestId)
        return
      }

      // 200: cache'de zaten hazır tahmin varmış, direkt döndü
      const data = (await res.json()) as MatchPrediction
      setStack((prev) => prev.map((entry) => (entry.fixture.id === fixture.id ? { ...entry, prediction: data, predictionLoading: false } : entry)))
    } catch {
      if (requestId !== requestIdRef.current) return
      setStack((prev) => prev.map((entry) => (entry.fixture.id === fixture.id ? { ...entry, prediction: null, predictionLoading: false } : entry)))
    }
  }, [panel, pollPrediction])

  const deletePrediction = useCallback(async () => {
    const fixture = panel?.fixture
    if (!fixture) return
    const res = await fetch(`/api/predict?fixtureId=${fixture.id}`, {
      method: "DELETE",
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Tahmin silinemedi")
    setStack((prev) => prev.map((entry) => (entry.fixture.id === fixture.id ? { ...entry, prediction: null } : entry)))
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
      value={{ panel, openMatch, closeMatch, closeAllMatch, syncFixture, triggerPrediction, deletePrediction }}
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
