import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import { NavTabs } from '@/components/nav-tabs'
import { LoginPromptModal } from '@/components/login-prompt-modal'
import { TeamProvider } from '@/contexts/team-context'
import { TeamPanel } from '@/components/team-panel'
import { LeagueProvider } from '@/contexts/league-context'
import { LeaguePanel } from '@/components/league-panel'
import { PlayerProvider } from '@/contexts/player-context'
import { PlayerPanel } from '@/components/player-panel'
import { PanelRouteGuard } from '@/components/panel-route-guard'
import { FavoritesProvider } from '@/contexts/favorites-context'
import { ThemeColorProvider } from '@/contexts/theme-color-context'
import { LanguageProvider } from '@/contexts/language-context'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { translate } from '@/lib/i18n/dictionaries'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// Standart "latin" alt kümesi Türkçe'ye özgü karakterleri (ş, ğ, ı, İ, ç, ö, ü)
// içermiyor — bunlar "latin-ext" alt kümesinde. Bu eksik olduğunda tarayıcı bu
// karakterleri siyah kutu + soru işareti (tofu) olarak gösteriyordu.
const geistSans = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-mono' })

const GA_MEASUREMENT_ID = 'G-HT84HW4PPM'

const SITE_URL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, 'meta.home.title')
  const description = translate(locale, 'meta.home.description')
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    generator: 'v0.app',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title,
    },
    icons: {
      icon: [
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: '/apple-touch-icon.png',
    },
    openGraph: {
      title,
      description,
      siteName: 'ED Company',
      locale: locale === 'tr' ? 'tr_TR' : 'en_US',
      type: 'website',
      images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image.png'],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f172a' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  userScalable: false,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getServerLocale()
  return (
    <html
      lang={locale}
      className={`bg-background ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        {process.env.NODE_ENV === 'production' && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}var a=localStorage.getItem('ed-accent-color');if(a&&a!=='green'){document.documentElement.setAttribute('data-accent',a);}}catch(e){}})();`,
          }}
        />
        <LanguageProvider initialLocale={locale}>
          <ThemeColorProvider>
            <LeagueProvider>
              <TeamProvider>
                <PlayerProvider>
                  <FavoritesProvider>
                    <PanelRouteGuard />
                    <NavTabs />
                    <LoginPromptModal />
                    {children}
                    <TeamPanel />
                    <LeaguePanel />
                    <PlayerPanel />
                    <Toaster />
                  </FavoritesProvider>
                </PlayerProvider>
              </TeamProvider>
            </LeagueProvider>
          </ThemeColorProvider>
        </LanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
