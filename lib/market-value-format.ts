// ---------------------------------------------------------------------------
// Eski kayıtlarla uyumluluk için piyasa değeri gösterim yardımcıları.
// Hem client hem server bileşenlerinden import edilebilir ve veritabanına
// bağlı değildir.
// ---------------------------------------------------------------------------

/**
 * Tam euro değerini kısa, okunabilir bir gösterime çevirir:
 * 1.470.000.000 -> "€1,47 Mr", 47.430.000 -> "€47,4 M", 850.000 -> "€850 B".
 * İngilizce modda (locale === "en") "€1.47 bn", "€47.4 m", "€850 k" biçimini kullanır.
 * null/geçersiz/<=0 değerler için null döner — bileşen bu durumda hiçbir şey
 * göstermemeli.
 */
export function formatMarketValueEur(eur: number | null | undefined, locale: "tr" | "en" = "tr"): string | null {
  if (eur === null || eur === undefined || !Number.isFinite(eur) || eur <= 0) return null

  const numberLocale = locale === "en" ? "en-US" : "tr-TR"
  const units =
    locale === "en" ? { billion: "bn", million: "m", thousand: "k" } : { billion: "Mr", million: "M", thousand: "B" }

  if (eur >= 1_000_000_000) {
    return `€${(eur / 1_000_000_000).toLocaleString(numberLocale, { maximumFractionDigits: 2 })} ${units.billion}`
  }
  if (eur >= 1_000_000) {
    return `€${(eur / 1_000_000).toLocaleString(numberLocale, { maximumFractionDigits: 1 })} ${units.million}`
  }
  if (eur >= 1_000) {
    return `€${(eur / 1_000).toLocaleString(numberLocale, { maximumFractionDigits: 0 })} ${units.thousand}`
  }
  return `€${eur.toLocaleString(numberLocale)}`
}
