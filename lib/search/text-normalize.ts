// ---------------------------------------------------------------------------
// Türkçe karakter/case duyarsız arama için tek ortak normalize fonksiyonu.
// app/api/teams/search, app/api/leagues/search ve app/api/players/search
// route'larındaki birbirinin kopyası olan normalizeTR fonksiyonlarıyla
// birebir aynı davranışa sahiptir — yeni /api/search/* uçları bu dosyayı
// kullanır (eski route'lar kasıtlı olarak dokunulmadan kendi kopyalarını
// kullanmayı sürdürür, bkz. v0_plans/deep-solution.md).
// ---------------------------------------------------------------------------

/** ş→s, ç→c, ğ→g, ü→u, ö→o, ı→i, küçük harfe çevirir ve kırpar. */
export function normalizeTR(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .trim()
}
