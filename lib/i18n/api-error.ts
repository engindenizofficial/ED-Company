/**
 * API rotaları artık ham Türkçe metin yerine sabit hata kodları döndürüyor
 * (örn. "invalidSection", "teamNotFound"). Bu fonksiyon, gelen kodu aktif
 * dile çevirir; kod tanınmıyorsa veya yoksa genel "sunucu hatası" mesajına
 * düşer. `t` parametresi, useLanguage() hook'undan gelen çeviri fonksiyonudur.
 */
export function translateApiError(
  t: (key: string, vars?: Record<string, string | number>) => string,
  code: unknown,
  status?: number,
): string {
  if (typeof code === "string" && code) {
    const key = `apiErrors.${code}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  return t("common.serverErrorWithStatus", { status: status ?? "" })
}
