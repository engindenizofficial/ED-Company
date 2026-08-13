import fs from 'node:fs'
import path from 'node:path'
import type { MetadataRoute } from 'next'

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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes = findPageRoutes(APP_DIR)
    .map((route) => (route === '/' ? '/' : route.replace(/\/$/, '')))
    .filter((route, index, all) => all.indexOf(route) === index) // dedupe
    .filter((route) => !isExcluded(route))
    .sort()

  return routes.map((route) => ({
    url: `${baseURL}${route}`,
    lastModified: now,
    changeFrequency: ROUTE_OVERRIDES[route]?.changeFrequency ?? DEFAULT_CHANGE_FREQUENCY,
    priority: ROUTE_OVERRIDES[route]?.priority ?? DEFAULT_PRIORITY,
  }))
}
