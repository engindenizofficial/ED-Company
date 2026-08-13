import type { MetadataRoute } from 'next'

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1, changeFrequency: 'daily' },
    { path: '/oyunlar', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/oyunlar/piyasa-degeri-duellosu', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/sign-in', priority: 0.3, changeFrequency: 'monthly' },
    { path: '/sign-up', priority: 0.3, changeFrequency: 'monthly' },
  ]

  return routes.map((route) => ({
    url: `${baseURL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
