/**
 * Sitenin base URL'ini platform env değişkenlerinden çözer.
 *
 * ÖNEMLİ — bazı platform/sandbox ortamlarında V0_RUNTIME_URL (ve nadiren
 * diğer URL değişkenleri) değerin başına/sonuna literal tek tırnak
 * karakterleri eklenmiş halde geliyor, örn: process.env.V0_RUNTIME_URL
 * === "'https://xyz.v0.build'" (tırnaklar string'in KENDİSİNİN bir parçası,
 * .env formatındaki gibi "parse edilip temizlenmesi gereken" bir şey değil).
 * new URL(...) veya Better Auth bu değeri olduğu gibi aldığında
 * "Invalid URL" / "Invalid base URL" hatasıyla patlıyordu. Bu fonksiyon her
 * adayı kullanmadan önce olası saran tırnakları temizler.
 */
function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

/**
 * Bir env değişkeninin ham değerini alıp olası saran tırnakları temizler.
 * `trustedOrigins` gibi tekil ham URL değerine ihtiyaç duyan yerlerde
 * (getSiteUrl()'ün aksine, burada "ilk geçerli aday" seçimi yapılmaz)
 * kullanılır.
 */
export function sanitize(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const cleaned = stripWrappingQuotes(value)
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Sitenin base URL'ini döndürür (sondaki `/` olmadan), sırasıyla:
 * BETTER_AUTH_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL ->
 * V0_RUNTIME_URL -> localhost fallback.
 *
 * Dönen değer her zaman `new URL()` ile parse edilebilir geçerli bir URL
 * olduğu doğrulanmış haldedir — geçersiz bir aday varsa bir sonraki adaya
 * düşülür, hepsi başarısız olursa localhost'a düşülür.
 */
export function getSiteUrl(): string {
  const candidates = [
    sanitize(process.env.BETTER_AUTH_URL),
    sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL) &&
      `https://${sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`,
    sanitize(process.env.VERCEL_URL) && `https://${sanitize(process.env.VERCEL_URL)}`,
    sanitize(process.env.V0_RUNTIME_URL),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      return url.origin
    } catch {
      // Geçersiz aday — sıradaki fallback'e geç.
      continue
    }
  }

  return 'http://localhost:3000'
}
