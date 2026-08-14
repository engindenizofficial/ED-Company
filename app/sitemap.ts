import fs from 'node:fs'
import path from 'node:path'
import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { teamMarketValue, playerMarketValue } from '@/lib/db/schema'
import { FEATURED_LEAGUE_IDS } from '@/lib/leagues'
import { getFixturesByDate, getSquad } from '@/lib/api-football'
import type { Fixture } from '@/lib/types'

// Sitemap her istekte değil, saatte bir yeniden üretilir — maç/lig/takım/oyuncu
// sayısı arttıkça her ziyarette DB + API-Football sorgusu yapmamak için.
export const revalidate = 3600

// Bugün maçı olan, 24 lig kapsamı dışındaki takımların kadrosu tek tek
// getSquad() ile çekiliyor (yüzlerce ekstra takım olabilir). Diğer ağır
// cron rotalarıyla (app/api/cron/*) aynı 300s bütçesi veriliyor ki soğuk
// cache'te (saatlik yenilemenin ilk isteği) zaman aşımına uğramasın.
export const maxDuration = 300

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

/**
 * Bugünün tüm fikstürleri (dünyadaki her lig, sadece bugün) — tek seferde
 * çekilip mac/lig/takim/oyuncu rotalarının hepsi bundan türetilir.
 *
 * Not: Sitede şu an sadece bugünün maçları (ana sayfadaki todayTR()) iç
 * linkle erişilebilir durumda — dün/önceki gün ve yarın/sonraki günler
 * için site içi tarih navigasyonu yok. Sitemap'i sitenin gerçekten
 * erişilebilir olduğu içerikle sınırlı tutmak için pencere kasıtlı olarak
 * "bugün" ile sınırlandı (yetim sayfa oluşturmamak ve API-Football
 * çağrılarını gereksiz büyütmemek için). Site içine tarih navigasyonu
 * eklenirse, bu fonksiyon geçmiş/gelecek günleri de kapsayacak şekilde
 * genişletilebilir.
 */
async function getTodayFixtures(): Promise<Fixture[]> {
  // Türkiye saatiyle bugün — app/api/fixtures/route.ts'teki todayTR() ile
  // aynı mantık, ana sayfada gösterilen tarihle birebir eşleşsin.
  const todayTR = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  return getFixturesByDate(todayTR)
}

function getMatchRoutes(fixtures: Fixture[]): string[] {
  return [...new Set(fixtures.map((fixture) => fixture.id))].map((id) => `/mac/${id}`)
}

/**
 * Öne çıkan 24 lig (lib/leagues.ts) + bugün en az bir maçı olan diğer
 * ligler (getFixturesByDate dünyadaki her ligi döndürür, sadece featured
 * olanları değil) — ana sayfadan gerçekten erişilebilen tüm lig sayfaları.
 */
function getLeagueRoutes(fixtures: Fixture[]): string[] {
  const ids = new Set<number>(FEATURED_LEAGUE_IDS)
  for (const fixture of fixtures) ids.add(fixture.league.id)
  return [...ids].map((id) => `/lig/${id}`)
}

/** Piyasa değeri tablosundaki 24 lig takım id'leri — DB'ye tek seferde sorulur. */
async function getDbTeamIds(): Promise<Set<number>> {
  const rows = await db.select({ teamId: teamMarketValue.teamId }).from(teamMarketValue)
  return new Set(rows.map((row) => row.teamId))
}

/** Piyasa değeri tablosundaki 24 lig oyuncu id'leri — DB'ye tek seferde sorulur. */
async function getDbPlayerIds(): Promise<Set<number>> {
  const rows = await db.select({ playerId: playerMarketValue.playerId }).from(playerMarketValue)
  return new Set(rows.map((row) => row.playerId))
}

/**
 * 24 ligdeki tüm takımlar (piyasa değeri tablosu — Transfermarkt cron'u bu
 * ligleri kapsıyor) + bugün en az bir maçı olan diğer takımlar.
 */
function getTeamRoutes(fixtures: Fixture[], dbTeamIds: Set<number>): string[] {
  const ids = new Set(dbTeamIds)
  for (const fixture of fixtures) {
    ids.add(fixture.home.id)
    ids.add(fixture.away.id)
  }
  return [...ids].map((id) => `/takim/${id}`)
}

/**
 * 24 ligdeki tüm oyuncular (piyasa değeri tablosu — 326 takımın kadrosunun
 * tamamı zaten burada) + bugün maçı olan ama 24 lig kapsamı dışındaki
 * takımların kadroları. Sadece bu "ekstra" takımlar için getSquad() çağrılır
 * — 24 ligdeki takımlar için zaten DB'de veri var, tekrar API'ye gidilmez.
 * getSquad zaten rate-limit korumalı (eş zamanlı istek sınırı + cache),
 * bu yüzden burada ekstra bir throttling gerekmiyor.
 */
async function getPlayerRoutes(
  fixtures: Fixture[],
  dbTeamIds: Set<number>,
  dbPlayerIds: Set<number>,
): Promise<string[]> {
  const extraTeamIds = new Set<number>()
  for (const fixture of fixtures) {
    if (!dbTeamIds.has(fixture.home.id)) extraTeamIds.add(fixture.home.id)
    if (!dbTeamIds.has(fixture.away.id)) extraTeamIds.add(fixture.away.id)
  }

  const ids = new Set(dbPlayerIds)
  const squads = await Promise.all([...extraTeamIds].map((teamId) => getSquad(teamId)))
  for (const squad of squads) {
    for (const player of squad) {
      if (player.id) ids.add(player.id)
    }
  }
  return [...ids].map((id) => `/oyuncu/${id}`)
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

  // Bugünün fikstürleri tek seferde çekilir — mac/lig/takim/oyuncu rotalarının
  // hepsi aynı veriden türetildiği için API-Football'a tekrar tekrar gidilmez.
  // Başarısız olursa (API geçici erişilemez) boş dizle devam edilir; bu durumda
  // lig/takım/oyuncu rotaları sadece 24 lig/DB kapsamına geri düşer, sitemap
  // boş kalmaz.
  const fixtures = await getTodayFixtures().catch(() => [] as Fixture[])

  // DB sorguları da birbirinden bağımsız — biri başarısız olursa diğeri
  // etkilenmez, ilgili rotalar sadece "bugünün ekstra takımları/oyuncuları"na
  // geri düşer.
  const [dbTeamIds, dbPlayerIds] = await Promise.all([
    getDbTeamIds().catch(() => new Set<number>()),
    getDbPlayerIds().catch(() => new Set<number>()),
  ])

  const leagueRoutes = getLeagueRoutes(fixtures)
  const teamRoutes = getTeamRoutes(fixtures, dbTeamIds)
  const matchRoutes = getMatchRoutes(fixtures)
  const playerRoutes = await getPlayerRoutes(fixtures, dbTeamIds, dbPlayerIds).catch(() => [] as string[])

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
