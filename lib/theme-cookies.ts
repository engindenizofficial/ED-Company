// Tema (koyu/açık mod) ve vurgu rengi tercihlerini localStorage'ın YANINDA bir
// çerezde de saklarız. localStorage tek başına güvenilir değil: telefonda
// "ana ekrana eklenmiş" PWA'larda işletim sistemi bu depolamayı zaman zaman
// temizleyebilir veya uygulama yeniden başlatıldığında farklı bir depolama
// bölümü kullanabilir. Çerez sayesinde sunucu (app/layout.tsx) ilk render'da
// doğru temayı doğrudan uygulayabilir — istemci JS'i hiç çalışmasa veya
// localStorage boşalmış olsa bile kullanıcı "orijinal" (açık + yeşil)
// görünüme düşmez.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 yıl

export const THEME_COOKIE = "theme"
export const ACCENT_COOKIE = "ed-accent-color"
export const LOCALE_COOKIE = "ed-locale"

export function setPreferenceCookie(name: string, value: string) {
  if (typeof document === "undefined") return
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    // sessizce geç (örn. çerezler kapalı)
  }
}
