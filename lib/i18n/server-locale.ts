import { headers } from "next/headers"
import { DEFAULT_LOCALE, type Locale } from "./dictionaries"

/**
 * İstek anındaki `Accept-Language` başlığından tarayıcı dilini çıkarır.
 * İstemci tarafındaki `detectBrowserLocale` (contexts/language-context.tsx)
 * ile aynı mantığı sunucuda çalışan metadata üretimi için uygular. Kullanıcı
 * dili elle değiştirirse (localStorage) bu, yalnızca ilk istek/metadata için
 * geçerli olur — sayfa içeriği zaten istemci tarafında anlık güncellenir.
 */
export async function getServerLocale(): Promise<Locale> {
  const headerList = await headers()
  const acceptLanguage = headerList.get("accept-language") ?? ""
  const languages = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean)

  for (const lang of languages) {
    if (lang?.startsWith("en")) return "en"
    if (lang?.startsWith("tr")) return "tr"
  }
  return DEFAULT_LOCALE
}
