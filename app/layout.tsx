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
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

const GA_MEASUREMENT_ID = 'G-HT84HW4PPM'

export const metadata: Metadata = {
  title: 'ED Company',
  description:
    'Günün maçlarını AI Monte Carlo simülasyonuyla analiz eden ED Company motoru: skor tahmini, kazanma yüzdeleri ve taktiksel rapor.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ED Company',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="tr"
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
                </FavoritesProvider>
              </PlayerProvider>
            </TeamProvider>
          </LeagueProvider>
        </ThemeColorProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
