/**
 * Sunucu tarafında global singleton polling yöneticisi.
 *
 * Kaç SSE bağlantısı olursa olsun API-Football'a giden istek sayısı sabittir:
 *  - Fixture listesi: her FIXTURE_POLL_MS (15s) bir istek
 *  - Canlı maç analizi: her LIVE_POLL_MS (10s) bir istek (maç başına)
 *
 * SSE stream'leri bu yöneticiye "abone" olur; yönetici Redis'e yazdıktan sonra
 * aboneleri notify eder. Aboneler Redis'i okuyarak veriyi client'a push eder.
 */

import {
  getFixturesByDate,
  getFixtureById,
  getStaticMatchData,
  getDynamicMatchData,
  getFixturePlayerStats,
} from "@/lib/api-football"
import {
  setCachedFixtures,
  setCachedLive,
  getCachedStaticMatch,
  setCachedStaticMatch,
  setCachedFixturePlayerStats,
} from "@/lib/redis"
import type { Fixture } from "@/lib/types"

const FIXTURE_POLL_MS = 15_000   // Fixture listesi için 15s
const LIVE_POLL_MS   = 10_000   // Canlı maç — sadece events+statistics için 10s

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"])

// ---------------------------------------------------------------------------
// Türkiye bugün
// ---------------------------------------------------------------------------
function todayTR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
}

// ---------------------------------------------------------------------------
// Subscriber tiplerı
// ---------------------------------------------------------------------------
type FixtureSubscriber = () => void
type AnalysisSubscriber = (fixtureId: number) => void

// ---------------------------------------------------------------------------
// Global state — Next.js dev mode hot-reload'da tekrar oluşmasın diye
// globalThis üzerinde tutuyoruz.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __edPollingManager: PollingManager | undefined
}

class PollingManager {
  private fixtureSubscribers = new Set<FixtureSubscriber>()
  private analysisSubscribers = new Set<AnalysisSubscriber>()

  // fixtureId → aktif polling interval
  private liveIntervals = new Map<number, ReturnType<typeof setInterval>>()
  // fixtureId → abone sayısı (0'a düşünce interval durdurulur)
  private liveSubscriberCounts = new Map<number, number>()
  // fixtureId → son player stats çekme zamanı (ms)
  private lastPlayerStatsPoll = new Map<number, number>()

  private fixtureInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startFixturePolling()
  }

  // -------------------------------------------------------------------------
  // Fixture listesi polling
  // -------------------------------------------------------------------------
  private startFixturePolling() {
    if (this.fixtureInterval) return

    this.fixtureInterval = setInterval(async () => {
      if (this.fixtureSubscribers.size === 0) return
      try {
        const date = todayTR()
        const fixtures = await getFixturesByDate(date)
        const payload = { date, fixtures, cachedAt: Date.now() }
        await setCachedFixtures(date, payload)
        this.notifyFixtureSubscribers()
      } catch {
        // Sessizce geç — mevcut cache geçerli kalmaya devam eder
      }
    }, FIXTURE_POLL_MS)
  }

  private notifyFixtureSubscribers() {
    for (const cb of this.fixtureSubscribers) cb()
  }

  subscribeFixtures(cb: FixtureSubscriber): () => void {
    this.fixtureSubscribers.add(cb)
    return () => this.fixtureSubscribers.delete(cb)
  }

  // -------------------------------------------------------------------------
  // Canlı maç analizi polling
  // -------------------------------------------------------------------------
  private async pollAnalysis(fixtureId: number) {
    try {
      const fixture = await getFixtureById(fixtureId)  // 1 istek
      if (!fixture) return

      const isLive = LIVE_STATUSES.has(fixture.statusShort)

      // --- Statik veri: sadece cache yoksa çek (3 saatte bir yenilenir) ---
      const cachedStatic = await getCachedStaticMatch(fixtureId)
      let staticData = cachedStatic
      if (!staticData) {
        staticData = await getStaticMatchData(fixture)  // 6 istek — sadece ilk seferinde
        await setCachedStaticMatch(fixtureId, staticData)
      }

      // --- Dinamik veri: her poll döngüsünde sadece events + statistics ---
      const dynamic = await getDynamicMatchData(fixture)  // 2 istek

      // Statik + dinamik veriyi birleştir
      const live = {
        fixture: dynamic.fixture,
        events: dynamic.events,
        statistics: dynamic.statistics,
        lineups: staticData.lineups,
        standings: staticData.standings,
        injuries: staticData.injuries,
        h2h: staticData.h2h,
        homeStats: staticData.homeStats,
        awayStats: staticData.awayStats,
      }

      // Player stats — maç canlıysa periyodik olarak güncelle (her 60s)
      if (isLive) {
        const lastPlayerPoll = this.lastPlayerStatsPoll.get(fixtureId) ?? 0
        if (Date.now() - lastPlayerPoll > 60_000) {
          const playerStats = await getFixturePlayerStats(fixtureId)  // 1 istek — 60s'de bir
          await setCachedFixturePlayerStats(fixtureId, playerStats)
          this.lastPlayerStatsPoll.set(fixtureId, Date.now())
        }
      }

      const ttl = isLive ? 20 : 60 * 60 * 6
      await setCachedLive(fixtureId, live, ttl)
      this.notifyAnalysisSubscribers(fixtureId)

      // Maç bittiyse interval'i durdur
      if (!isLive) {
        this.stopLivePolling(fixtureId)
        this.lastPlayerStatsPoll.delete(fixtureId)
      }
    } catch {
      // Sessizce geç — mevcut cache geçerli kalmaya devam eder
    }
  }

  private notifyAnalysisSubscribers(fixtureId: number) {
    for (const cb of this.analysisSubscribers) cb(fixtureId)
  }

  private stopLivePolling(fixtureId: number) {
    const interval = this.liveIntervals.get(fixtureId)
    if (interval) {
      clearInterval(interval)
      this.liveIntervals.delete(fixtureId)
    }
  }

  subscribeAnalysis(fixtureId: number, cb: AnalysisSubscriber): () => void {
    this.analysisSubscribers.add(cb)

    // Abone sayısını artır
    const count = (this.liveSubscriberCounts.get(fixtureId) ?? 0) + 1
    this.liveSubscriberCounts.set(fixtureId, count)

    // Bu fixture için henüz interval yoksa başlat
    if (!this.liveIntervals.has(fixtureId)) {
      const interval = setInterval(() => this.pollAnalysis(fixtureId), LIVE_POLL_MS)
      this.liveIntervals.set(fixtureId, interval)
    }

    return () => {
      this.analysisSubscribers.delete(cb)
      const newCount = (this.liveSubscriberCounts.get(fixtureId) ?? 1) - 1
      this.liveSubscriberCounts.set(fixtureId, newCount)

      // Hiç abone kalmadıysa interval'i durdur
      if (newCount <= 0) {
        this.stopLivePolling(fixtureId)
        this.liveSubscriberCounts.delete(fixtureId)
      }
    }
  }
}

// Singleton — globalThis üzerinde saklıyoruz ki hot-reload'da kaybolmasın
if (!globalThis.__edPollingManager) {
  globalThis.__edPollingManager = new PollingManager()
}

export const pollingManager = globalThis.__edPollingManager
export { LIVE_STATUSES, todayTR }
