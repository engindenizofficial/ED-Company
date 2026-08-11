// ---------------------------------------------------------------------------
// Piyasa değeri gösterim yardımcıları. Hem client hem server bileşenlerinden
// import edilebilir — bu dosya veritabanına (pg) bağımlı DEĞİLDİR. DB'ye
// erişen okuma fonksiyonları için bkz. lib/market-values.ts (server-only).
// ---------------------------------------------------------------------------

/**
 * Tam euro değerini kısa, okunabilir bir gösterime çevirir (Transfermarkt
 * tarzı): 1.470.000.000 -> "€1,47 Mr", 47.430.000 -> "€47,4 M", 850.000 -> "€850 B".
 * null/geçersiz/<=0 değerler için null döner — bileşen bu durumda hiçbir şey
 * göstermemeli.
 */
export function formatMarketValueEur(eur: number | null | undefined): string | null {
  if (eur === null || eur === undefined || !Number.isFinite(eur) || eur <= 0) return null

  if (eur >= 1_000_000_000) {
    return `€${(eur / 1_000_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} Mr`
  }
  if (eur >= 1_000_000) {
    return `€${(eur / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M`
  }
  if (eur >= 1_000) {
    return `€${(eur / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} B`
  }
  return `€${eur.toLocaleString("tr-TR")}`
}
