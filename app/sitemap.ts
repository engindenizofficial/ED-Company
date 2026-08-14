import fs from 'node:fs'
import path from 'node:path'
import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { teamMarketValue, playerMarketValue } from '@/lib/db/schema'
import { FEATURED_LEAGUE_IDS } from '@/lib/leagues'
import { getFixturesByDate } from '@/lib/api-football'

// Sitemap her istekte değil, saatte bir yeniden üretilir — maç/lig/takım/oyuncu
// sayısı arttıkça her ziyarette DB + API-Football sorgusu yapmamak için.
export const revalidate = 3600

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))

const APP_DIR = path.join(process.cwd(), 'app')

// Route prefixes that should never show up in the sitemap (private,
// auth-gated, or non-content routes). Add to this list as needed.
const EXCLUDED_PREFIXES = ['/admin', '/auth', '/api']

// Exact routes that exist as pages but shouldn't be indexed (account
// action pages, callbacks, etc).
const EXCLUDED_EXACT = ['/delete-account', '/verify-email']

// Per-route priority / change frequency overrides. Anything not listed
// here falls back to the DEFAULT_* values below, so new pages are picked
// up automatically without needing an entry.
const ROUTE_OVERRIDES: Record<
  string,
  { priority?: number; changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'] }
> = {
  '/': { priority: 1, changeFrequency: 'daily' },
  '/oyunlar': { priority: 0.8, changeFrequency: 'weekly' },
  '/oyunlar/piyasa-degeri-duellosu': { priority: 0.7, changeFrequency: 'weekly' },
  '/sign-in': { priority: 0.3, changeFrequency: 'monthly' },
  '/sign-up': { priority: 0.3, changeFrequency: 'monthly' },
}

const DEFAULT_PRIORITY = 0.5
const DEFAULT_CHANGE_FREQUENCY: MetadataRoute.Sitemap[number]['changeFrequency'] = 'weekly'

// Dinamik ([id]) rota önekleri için priority/changeFrequency. Sıra önemli:
// ilk eşleşen kazanır, en spesifik önek en üstte olmalı.
const DYNAMIC_ROUTE_OVERRIDES: Array<{
  prefix: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
}> = [
  { prefix: '/mac/', priority: 0.6, changeFrequency: 'hourly' },
  { prefix: '/lig/', priority: 0.7, changeFrequency: 'weekly' },
  { prefix: '/takim/', priority: 0.6, changeFrequency: 'weekly' },
  { prefix: '/oyuncu/', priority: 0.5, changeFrequency: 'weekly' },
]

function getRouteMeta(route: string) {
  const exact = ROUTE_OVERRIDES[route]
  if (exact) return { priority: exact.priority ?? DEFAULT_PRIORITY, changeFrequency: exact.changeFrequency ?? DEFAULT_CHANGE_FREQUENCY }

  const dynamic = DYNAMIC_ROUTE_OVERRIDES.find((entry) => route.startsWith(entry.prefix))
  if (dynamic) return { priority: dynamic.priority, changeFrequency: dynamic.changeFrequency }

  return { priority: DEFAULT_PRIORITY, changeFrequency: DEFAULT_CHANGE_FREQUENCY }
}

/** Bugünden itibaren geriye/ileriye doğru YYYY-MM-DD tarih listesi üretir. */
function dateRange(pastDays: number, futureDays: number): string[] {
  const dates: string[] = []
  const today = new Date()
  for (let offset = -pastDays; offset <= futureDays; offset++) {
    const d = new Date(today)
    d.setDate(d.getDate() + offset)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/** Son 2 gün + gelecek 5 gün içindeki tüm fikstürlerin /mac/[id] rotaları. */
async function getMatchRoutes(): Promise<string[]> {
  const dates = dateRange(2, 5)
  const results = await Promise.allSettled(dates.map((date) => getFixturesByDate(date)))

  const ids = new Set<number>()
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const fixture of result.value) ids.add(fixture.id)
    }
  }
  return [...ids].map((id) => `/mac/${id}`)
}

/** Öne çıkan 24 ligin /lig/[id] rotaları — tek kaynak: lib/leagues.ts. */
function getLeagueRoutes(): string[] {
  return FEATURED_LEAGUE_IDS.map((id) => `/lig/${id}`)
}

/** Piyasa değeri tablolarında eşleşmiş tüm takımların /takim/[id] rotaları. */
async function getTeamRoutes(): Promise<string[]> {
  const rows = await db.select({ teamId: teamMarketValue.teamId }).from(teamMarketValue)
  return [...new Set(rows.map((row) => row.teamId))].map((id) => `/takim/${id}`)
}

/** Piyasa değeri tablolarında eşleşmiş tüm oyuncuların /oyuncu/[id] rotaları. */
async function getPlayerRoutes(): Promise<string[]> {
  const rows = await db.select({ playerId: playerMarketValue.playerId }).from(playerMarketValue)
  return [...new Set(rows.map((row) => row.playerId))].map((id) => `/oyuncu/${id}`)
}

function isPrivateSegment(segment: string) {
  // Next.js private folders (`_folder`) and parallel-route slots (`@slot`)
  // are never routable and must be skipped while walking.
  return segment.startsWith('_') || segment.startsWith('@')
}

function isRouteGroup(segment: string) {
  // Route groups like `(marketing)` don't appear in the URL.
  return segment.startsWith('(') && segment.endsWith(')')
}

function isDynamicSegment(segment: string) {
  // Dynamic segments ([id], [...slug], [[...slug]]) can't be resolved
  // without runtime data, so pages using them are skipped automatically.
  return segment.startsWith('[')
}

/**
 * Recursively walks the `app` directory and returns every public,
 * statically-resolvable route that has a `page.tsx`/`page.ts` file.
 */
function findPageRoutes(dir: string, segments: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const routes: string[] = []

  const hasPage = entries.some((entry) => entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name))
  if (hasPage) {
    const urlSegments = segments.filter((segment) => !isRouteGroup(segment))
    routes.push(`/${urlSegments.join('/')}`.replace(/\/+/g, '/'))
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (isPrivateSegment(entry.name) || isDynamicSegment(entry.name)) continue

    routes.push(...findPageRoutes(path.join(dir, entry.name), [...segments, entry.name]))
  }

  return routes
}

function isExcluded(route: string) {
  if (EXCLUDED_EXACT.includes(route)) return true
  return EXCLUDED_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes = findPageRoutes(APP_DIR)
    .map((route) => (route === '/' ? '/' : route.replace(/\/$/, '')))
    .filter((route) => !isExcluded(route))

  // Her kaynak birbirinden bağımsız — biri (örn. API-Football geçici olarak
  // erişilemez) başarısız olursa diğerleri sitemap'i boş bırakmasın.
  const [matchRoutes, teamRoutes, playerRoutes] = await Promise.all([
    getMatchRoutes().catch(() => []),
    getTeamRoutes().catch(() => []),
    getPlayerRoutes().catch(() => []),
  ])
  const leagueRoutes = getLeagueRoutes()

  const routes = [...staticRoutes, ...leagueRoutes, ...teamRoutes, ...playerRoutes, ...matchRoutes]
    .filter((route, index, all) => all.indexOf(route) === index) // dedupe
    .sort()

  return routes.map((route) => {
    const { priority, changeFrequency } = getRouteMeta(route)
    return {
      url: `${baseURL}${route}`,
      lastModified: now,
      changeFrequency,
      priority,
    }
  })
}
