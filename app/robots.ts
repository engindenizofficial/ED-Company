import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

const baseURL = getSiteUrl()

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
