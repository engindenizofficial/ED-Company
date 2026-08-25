import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { cookies } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { NavTabs } from '@/components/nav-tabs'
import { SiteFooter } from '@/components/site-footer'
import { LoginPromptModal } from '@/components/login-prompt-modal'
import { TeamProvider } from '@/contexts/team-context'
import { LeagueProvider } from '@/contexts/league-context'
import { PlayerProvider } from '@/contexts/player-context'
import { MatchProvider } from '@/contexts/match-context'
import { PanelStackProvider } from '@/contexts/panel-stack-context'
// Takım/Lig/Oyuncu/Maç panelleri kapalıyken "return null" dönüyor ama
// statik import edildiklerinde JS'leri (özellikle MatchPanel'in içindeki
// ~2400 satırlık AnalysisPanel) HER sayfanın ana JS paketine gömülüp ana iş
// parçacığını bloke ediyordu. `next/dynamic`'in `ssr:false` seçeneği App
// Router'da yalnızca Client Component içinde kullanılabildiği için bu dört
// paneli ayrı bir client wrapper'a (components/lazy-panels.tsx) taşıdık —
// görünüm/davranış hiç değişmez, sadece kodları ayrı chunk'larda yüklenir.
import { LazyPanels } from '@/components/lazy-panels'
import { PanelRouteGuard } from '@/components/panel-route-guard'
import { PwaUpdateWatcher } from '@/components/pwa-update-watcher'
import { PushSoundListener } from '@/components/push-sound-listener'
import { FavoritesProvider } from '@/contexts/favorites-context'
import { CountryProvider } from '@/contexts/country-context'
import { ThemeColorProvider } from '@/contexts/theme-color-context'
import { LanguageProvider } from '@/contexts/language-context'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { translate } from '@/lib/i18n/dictionaries'
import { Toaster } from '@/components/ui/sonner'
import { getSiteUrl } from '@/lib/site-url'
import { DEFAULT_ACCENT_COLOR, isValidAccentColor } from '@/lib/accent-colors'
import { THEME_COOKIE, ACCENT_COOKIE } from '@/lib/theme-cookies'
import './globals.css'

// Standart "latin" alt kümesi Türkçe'ye özgü karakterleri (ş, ğ, ı, İ, ç, ö, ü)
// içermiyor — bunlar "latin-ext" alt kümesinde. Bu eksik olduğunda tarayıcı bu
// karakterleri siyah kutu + soru işareti (tofu) olarak gösteriyordu.
const geistSans = Geist({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-geist-mono' })

const GA_MEASUREMENT_ID = 'G-HT84HW4PPM'
const ADSENSE_CLIENT_ID = 'ca-pub-1552985197555443'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const title = translate(locale, 'meta.home.title')
  const description = translate(locale, 'meta.home.description')
  return {
    metadataBase: new URL(getSiteUrl()),
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
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getServerLocale()

  // Tema/renk tercihini localStorage yerine (veya ona ek olarak) çerezden
  // okuyup <html> etiketine sunucuda uygularız. Böylece PWA'da localStorage
  // temizlense veya gecikmeli okunsa bile ilk render doğru temayla gelir —
  // istemci scripti sadece localStorage->çerez göçünü tamamlar.
  const cookieStore = await cookies()
  const isDark = cookieStore.get(THEME_COOKIE)?.value === 'dark'
  const accentCookieValue = cookieStore.get(ACCENT_COOKIE)?.value
  const accentColor = isValidAccentColor(accentCookieValue) ? accentCookieValue : DEFAULT_ACCENT_COLOR

  return (
    <html
      lang={locale}
      className={`bg-background ${isDark ? 'dark' : ''} ${geistSans.variable} ${geistMono.variable}`}
      data-accent={accentColor !== DEFAULT_ACCENT_COLOR ? accentColor : undefined}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        {process.env.NODE_ENV === 'production' && (
          <>
            {/* AdSense script'i artık <head>'e ham <script> olarak değil,
                strategy="lazyOnload" ile buraya taşındı. Google auto-ads
                bunu head'de bulmasa da işleviyor; asıl kazanç şu: script artık
                sayfa render/hydration bitip tarayıcı boşa çıkana kadar ağ
                kuyruğuna girmiyor. Önceden <head>'deki bu istek, ilk render'ı
                bekleten kaynaklarla rekabet ederek "oluşturma engelleme
                istekleri" uyarısına katkı veriyordu. */}
            <Script
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
              strategy="lazyOnload"
              crossOrigin="anonymous"
            />
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
            // Sunucu zaten çerezden doğru temayı uyguladı; bu script sadece
            // eski localStorage-only tercihleri çereze göçürür (self-heal),
            // böylece bir sonraki sunucu render'ında da kalıcı olur.
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');document.cookie='theme=dark; path=/; max-age=31536000; SameSite=Lax';}var a=localStorage.getItem('ed-accent-color');if(a&&a!=='green'){document.documentElement.setAttribute('data-accent',a);document.cookie='ed-accent-color='+a+'; path=/; max-age=31536000; SameSite=Lax';}}catch(e){}})();`,
          }}
        />
        <PwaUpdateWatcher />
        <PushSoundListener />
        <LanguageProvider initialLocale={locale}>
          <ThemeColorProvider initialAccentColor={accentColor}>
            <CountryProvider>
              <PanelStackProvider>
                <LeagueProvider>
                  <TeamProvider>
                    <PlayerProvider>
                      <MatchProvider>
                        <FavoritesProvider>
                          <PanelRouteGuard />
                          <NavTabs />
                          <LoginPromptModal />
                          {children}
                          <SiteFooter />
                          <LazyPanels />
                          <Toaster />
                        </FavoritesProvider>
                      </MatchProvider>
                    </PlayerProvider>
                  </TeamProvider>
                </LeagueProvider>
              </PanelStackProvider>
            </CountryProvider>
          </ThemeColorProvider>
        </LanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
