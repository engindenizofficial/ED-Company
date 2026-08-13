import type { MetadataRoute } from 'next'

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/verify-email', '/delete-account', '/auth/'],
    },
    sitemap: `${baseURL}/sitemap.xml`,
  }
}
