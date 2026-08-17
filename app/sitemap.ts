import fs from 'node:fs'
import path from 'node:path'
import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { teamMarketValue, playerMarketValue } from '@/lib/db/schema'
import { FEATURED_LEAGUE_IDS } from '@/lib/leagues'
import { getFixturesByDate } from '@/lib/api-football'
import { getSiteUrl } from '@/lib/site-url'
import type { Fixture } from '@/lib/types'

// Sitemap her istekte değil, saatte bir yeniden üretilir — maç/lig/takım/oyuncu
// sayısı arttıkça her ziyarette DB + API-Football sorgusu yapmamak için.
export const revalidate = 3600

// Diğer ağır cron rotalarıyla (app/api/cron/*) aynı 300s bütçesi veriliyor
// ki soğuk cache'te (saatlik yenilemenin ilk isteği) zaman aşımına uğramasın.
export const maxDuration = 300

const baseURL = getSiteUrl()

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
  '/oyunlar/kulubunu-kur': { priority: 0.7, changeFrequency: 'weekly' },
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
 * Rota -> gerçek "son değişti" tarihi. Sadece elimizde gerçek bir sinyal
 * olan rotalar için doldurulur (maç kickoff tarihi, DB updatedAt). Elimizde
 * gerçek sinyal olmayan rotalar (bugün maçı olduğu için görünen ama DB dışı
 * takım/oyuncu/lig) haritada YOK sayılır — Google'a sahte "az önce değişti"
 * sinyali vermemek için lastModified boş bırakılır.
 */
function buildLastModifiedMap(
  fixtures: Fixture[],
  dbTeamRows: { teamId: number; updatedAt: Date }[],
  dbPlayerRows: { playerId: number; updatedAt: Date }[],
): Map<string, Date> {
  const map = new Map<string, Date>()

  for (const fixture of fixtures) {
    const kickoff = new Date(fixture.date)
    if (!Number.isNaN(kickoff.getTime())) map.set(`/mac/${fixture.id}`, kickoff)
  }
  for (const row of dbTeamRows) map.set(`/takim/${row.teamId}`, row.updatedAt)
  for (const row of dbPlayerRows) map.set(`/oyuncu/${row.playerId}`, row.updatedAt)

  return map
}

/**
 * Sadece öne çıkan 24 lig (lib/leagues.ts) — kalıcı/DB kapsamlı ligler.
 *
 * Not: Bugün en az bir maçı olan ama 24 lig kapsamı dışındaki ligler
 * kasıtlı olarak dışarıda bırakılıyor. O ligler yarın maçı olmadığında
 * sitemap'ten çıkıp sonra tekrar girip çıkacaktı ("URL churn") — bu,
 * arama motoruna içerik yerine liste kararsızlığı sinyali gönderir.
 * Sayfaların kendisi (app/lig/[id]) hâlâ canlı ve erişilebilir, sadece
 * bu geçici/kalıcı olmayan ligler sitemap listesine girmiyor.
 */
function getLeagueRoutes(): string[] {
  return FEATURED_LEAGUE_IDS.map((id) => `/lig/${id}`)
}

/**
 * Piyasa değeri tablosundaki 24 lig takım id'leri + updatedAt — DB'ye tek
 * seferde sorulur. updatedAt, sitemap'te gerçek lastModified sinyali olarak
 * kullanılır (sahte "her gün değişti" sinyali vermemek için).
 */
async function getDbTeamRows(): Promise<{ teamId: number; updatedAt: Date }[]> {
  return db.select({ teamId: teamMarketValue.teamId, updatedAt: teamMarketValue.updatedAt }).from(teamMarketValue)
}

/**
 * Piyasa değeri tablosundaki 24 lig oyuncu id'leri + updatedAt — DB'ye tek
 * seferde sorulur.
 */
async function getDbPlayerRows(): Promise<{ playerId: number; updatedAt: Date }[]> {
  return db
    .select({ playerId: playerMarketValue.playerId, updatedAt: playerMarketValue.updatedAt })
    .from(playerMarketValue)
}

/**
 * Sadece 24 ligdeki takımlar (piyasa değeri tablosu — Transfermarkt cron'u
 * bu ligleri kapsıyor). Bugün maçı olan ama 24 lig kapsamı dışındaki
 * takımlar kasıtlı olarak dışarıda bırakılıyor (bkz. getLeagueRoutes'taki
 * URL churn notu) — sayfaları hâlâ erişilebilir, sadece sitemap listesine
 * girip çıkmıyorlar.
 */
function getTeamRoutes(dbTeamIds: Set<number>): string[] {
  return [...dbTeamIds].map((id) => `/takim/${id}`)
}

/**
 * Sadece 24 ligdeki oyuncular (piyasa değeri tablosu — 326 takımın
 * kadrosunun tamamı zaten burada). Bugün maçı olan ama 24 lig kapsamı
 * dışındaki takımların kadroları kasıtlı olarak dışarıda bırakılıyor
 * (bkz. getLeagueRoutes'taki URL churn notu) — bu sayede getSquad() ile
 * ekstra API-Football çağrısı da gerekmiyor.
 */
function getPlayerRoutes(dbPlayerIds: Set<number>): string[] {
  return [...dbPlayerIds].map((id) => `/oyuncu/${id}`)
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

// Statik sayfalar (ana sayfa hariç) için gerçek bir "değişti" sinyali yok —
// bunlara her yenilemede "now" yazmak sahte tazelik sinyali olur, o yüzden
// build/deploy anına sabitleniyor.
const BUILD_TIME = new Date()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = findPageRoutes(APP_DIR)
    .map((route) => (route === '/' ? '/' : route.replace(/\/$/, '')))
    .filter((route) => !isExcluded(route))

  // Bugünün fikstürleri sadece /mac/{id} rotaları ve lastModified sinyali
  // için çekiliyor artık — lig/takım/oyuncu rotaları kalıcı (24 lig/DB)
  // kapsamla sınırlandırıldığı için fixture verisine bağımlı değiller.
  // Başarısız olursa (API geçici erişilemez) boş dizle devam edilir, sitemap
  // boş kalmaz — sadece bugünün maç sayfaları o çalıştırmada eksik olur.
  const fixtures = await getTodayFixtures().catch(() => [] as Fixture[])

  // DB sorguları da birbirinden bağımsız — biri başarısız olursa diğeri
  // etkilenmez.
  const [dbTeamRows, dbPlayerRows] = await Promise.all([
    getDbTeamRows().catch(() => [] as { teamId: number; updatedAt: Date }[]),
    getDbPlayerRows().catch(() => [] as { playerId: number; updatedAt: Date }[]),
  ])
  const dbTeamIds = new Set(dbTeamRows.map((row) => row.teamId))
  const dbPlayerIds = new Set(dbPlayerRows.map((row) => row.playerId))

  const leagueRoutes = getLeagueRoutes()
  const teamRoutes = getTeamRoutes(dbTeamIds)
  const matchRoutes = getMatchRoutes(fixtures)
  const playerRoutes = getPlayerRoutes(dbPlayerIds)

  const routes = [...staticRoutes, ...leagueRoutes, ...teamRoutes, ...playerRoutes, ...matchRoutes]
    .filter((route, index, all) => all.indexOf(route) === index) // dedupe
    .sort()

  // Sadece elimizde gerçek bir sinyal olan rotalar için lastModified doldurulur
  // (maç kickoff tarihi, DB updatedAt). Bugün maçı olduğu için görünen ama DB
  // dışı takım/oyuncu/lig rotalarında bu bilgi yok — Google'a sahte "az önce
  // değişti" sinyali vermemek için lastModified o rotalarda boş bırakılır.
  const lastModifiedMap = buildLastModifiedMap(fixtures, dbTeamRows, dbPlayerRows)

  return routes.map((route) => {
    const { priority, changeFrequency } = getRouteMeta(route)
    const lastModified = lastModifiedMap.get(route) ?? (route === '/' ? new Date() : BUILD_TIME)
    return {
      url: `${baseURL}${route}`,
      lastModified,
      changeFrequency,
      priority,
    }
  })
}
